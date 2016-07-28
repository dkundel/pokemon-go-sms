'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const geolib = require('geolib');
const moment = require('moment');
const geocoder = require('node-geocoder')({ provider: 'openstreetmap' });
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const app = express();
const twilioGating = twilio.webhook();

app.use(bodyParser.json({})) 
app.use(bodyParser.urlencoded({
  extended: true
}));

const PokeWatchers = new Map();
const PORT = process.env.PORT || 3000;
const POKEVISION_API = 'https://pokevision.com/map/data';
const POKEDEX = `,Bulbasaur,Ivysaur,Venusaur,Charmander,Charmeleon,Charizard,Squirtle,Wartortle,Blastoise,Caterpie,Metapod,Butterfree,Weedle,Kakuna,Beedrill,Pidgey,Pidgeotto,Pidgeot,Rattata,Raticate,Spearow,Fearow,Ekans,Arbok,Pikachu,Raichu,Sandshrew,Sandslash,Nidoran♀,Nidorina,Nidoqueen,Nidoran♂,Nidorino,Nidoking,Clefairy,Clefable,Vulpix,Ninetales,Jigglypuff,Wigglytuff,Zubat,Golbat,Oddish,Gloom,Vileplume,Paras,Parasect,Venonat,Venomoth,Diglett,Dugtrio,Meowth,Persian,Psyduck,Golduck,Mankey,Primeape,Growlithe,Arcanine,Poliwag,Poliwhirl,Poliwrath,Abra,Kadabra,Alakazam,Machop,Machoke,Machamp,Bellsprout,Weepinbell,Victreebel,Tentacool,Tentacruel,Geodude,Graveler,Golem,Ponyta,Rapidash,Slowpoke,Slowbro,Magnemite,Magneton,Farfetch'd,Doduo,Dodrio,Seel,Dewgong,Grimer,Muk,Shellder,Cloyster,Gastly,Haunter,Gengar,Onix,Drowzee,Hypno,Krabby,Kingler,Voltorb,Electrode,Exeggcute,Exeggutor,Cubone,Marowak,Hitmonlee,Hitmonchan,Lickitung,Koffing,Weezing,Rhyhorn,Rhydon,Chansey,Tangela,Kangaskhan,Horsea,Seadra,Goldeen,Seaking,Staryu,Starmie,Mr. Mime,Scyther,Jynx,Electabuzz,Magmar,Pinsir,Tauros,Magikarp,Gyarados,Lapras,Ditto,Eevee,Vaporeon,Jolteon,Flareon,Porygon,Omanyte,Omastar,Kabuto,Kabutops,Aerodactyl,Snorlax,Articuno,Zapdos,Moltres,Dratini,Dragonair,Dragonite,Mewtwo,Mew`.split(',');

function getPokemonAround(location) {
  return new Promise((resolve, reject) => {
    request(`${POKEVISION_API}/${location.latitude}/${location.longitude}` , (err, response, body) => {
      if (err) {
        reject(err);
      } else if (response.statusCode === 200) {
        resolve(JSON.parse(body).pokemon);
      } else {
        reject({ message: 'Failed request'});
      }
    });
  });
}

function extractPokeInfo(baseLocation) {
  return (pokemon) => {
    let { longitude, latitude } = pokemon;
    let expirationTime = pokemon.expiration_time * 1000;
    let name = POKEDEX[pokemon.pokemonId];
    let duration = moment.duration(expirationTime - Date.now()).humanize();
    let distance = geolib.getDistance(baseLocation, { longitude, latitude });

    return { name, duration, longitude, latitude, distance };
  }
}

function sortClosestPokemon(pokemonA, pokemonB) {
  return pokemonA.distance - pokemonB.distance;
}

function getPokemonByAddress(address) {
  let baseLocation;
  return geocoder.geocode(address).then(result => {
    baseLocation = result[0] || { longitude: 0, latitude: 0 };
    return baseLocation;
  }).then(getPokemonAround).then(pokemon => {
    return {
      pokemon: pokemon.map(extractPokeInfo(baseLocation)).sort(sortClosestPokemon),
      location: baseLocation
    }
  });
}

function formatPokeList(pokeList, location) {
  let formattedPokemon = pokeList.slice(0, 6).map(pokemon => {
    return `${pokemon.name}, ${pokemon.distance}m, ${pokemon.duration}`;
  }).join(`\n`)
  return `There are the following Pokemon around:
${formattedPokemon}
https://pokevision.com/#/@${location.latitude},${location.longitude}`;
}

app.get('/:address', (req, res) => {
  getPokemonByAddress(req.params.address).then(info => {
    let { location, pokemon } = info;
    res.type('text/plain').send(formatPokeList(pokemon, location));
  }).catch(err => {
    console.error(err);
  });
});

app.post(twilioGating, '/incoming', (req, res) => {
  let message = req.body.Body;
  if (message.toLowerCase().trim().indexOf('subscribe:') === 0) {
    message = message.substr('subscribe:'.length);
    let [pokemonName, location] = message.split(';').map(m => m.trim());

    PokeWatchers.set(`${req.body.From},${pokemonName}`, location);

    res.type('text/plain').send(`We will be on the watch for ${pokemonName} around ${location}`);
  } else {
    getPokemonByAddress(message).then(info => {
      let { location, pokemon } = info;
      let targetPhoneNumber = req.body.From;
      let senderPhoneNumber = req.body.To;
      let message = formatPokeList(pokemon, location);
      return client.sendMessage({
        from: senderPhoneNumber,
        to: targetPhoneNumber,
        body: message
      });
    }).catch(err => {
      console.error(err);
    });
  }
});

function watchForPokemon() {
  console.log('Looking for Pokemon...');
  for(let [keyInfo, address] of PokeWatchers) {
    let [number, wantedPokemon] = keyInfo.split(',');
    getPokemonByAddress(address).then(info => {
      let { location, pokemon } = info;
      let availablePokemon = pokemon.filter(poke => poke.name === wantedPokemon);
      if (availablePokemon.length !== 0) {
        let body = formatText(availablePokemon, location);
        let from = '{{YOUR TWILIO NUMBER}}';
        let to = number;
        PokeWatchers.delete(infoStr);
        return client.sendMessage({body, from, to});
      }
      return Promise.resolve(true);
    }).catch(err => {
      console.error(err);
    });;
  }
}

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  watchForPokemon();
  setInterval(watchForPokemon, 60 * 1000);
});