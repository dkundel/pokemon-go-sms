'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const moment = require('moment');
const geocoder = require('node-geocoder')({ provider: 'openstreetmap' });
const geolib = require('geolib');
const twilio = require('twilio');

const app = express();
const client = twilio();

app.use(bodyParser.json({})) 
app.use(bodyParser.urlencoded({
  extended: true
}));

const PORT = process.env.PORT || 3000;
const POKEVISION_API = 'https://pokevision.com/map/data';
const TAKE_COUNT = 6;
const POKEDEX = `,Bulbasaur,Ivysaur,Venusaur,Charmander,Charmeleon,Charizard,Squirtle,Wartortle,Blastoise,Caterpie,Metapod,Butterfree,Weedle,Kakuna,Beedrill,Pidgey,Pidgeotto,Pidgeot,Rattata,Raticate,Spearow,Fearow,Ekans,Arbok,Pikachu,Raichu,Sandshrew,Sandslash,Nidoran♀,Nidorina,Nidoqueen,Nidoran♂,Nidorino,Nidoking,Clefairy,Clefable,Vulpix,Ninetales,Jigglypuff,Wigglytuff,Zubat,Golbat,Oddish,Gloom,Vileplume,Paras,Parasect,Venonat,Venomoth,Diglett,Dugtrio,Meowth,Persian,Psyduck,Golduck,Mankey,Primeape,Growlithe,Arcanine,Poliwag,Poliwhirl,Poliwrath,Abra,Kadabra,Alakazam,Machop,Machoke,Machamp,Bellsprout,Weepinbell,Victreebel,Tentacool,Tentacruel,Geodude,Graveler,Golem,Ponyta,Rapidash,Slowpoke,Slowbro,Magnemite,Magneton,Farfetch'd,Doduo,Dodrio,Seel,Dewgong,Grimer,Muk,Shellder,Cloyster,Gastly,Haunter,Gengar,Onix,Drowzee,Hypno,Krabby,Kingler,Voltorb,Electrode,Exeggcute,Exeggutor,Cubone,Marowak,Hitmonlee,Hitmonchan,Lickitung,Koffing,Weezing,Rhyhorn,Rhydon,Chansey,Tangela,Kangaskhan,Horsea,Seadra,Goldeen,Seaking,Staryu,Starmie,Mr. Mime,Scyther,Jynx,Electabuzz,Magmar,Pinsir,Tauros,Magikarp,Gyarados,Lapras,Ditto,Eevee,Vaporeon,Jolteon,Flareon,Porygon,Omanyte,Omastar,Kabuto,Kabutops,Aerodactyl,Snorlax,Articuno,Zapdos,Moltres,Dratini,Dragonair,Dragonite,Mewtwo,Mew`.split(',');

const FILTER_POKEMON = `Rattata,Pidgey,Zubat,Spearow`;

const SubscribeMap = new Map();

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
    let expirationTime = pokemon.expiration_time;
    let name = POKEDEX[pokemon.pokemonId];
    let duration = moment.duration(expirationTime * 1000 - Date.now()).humanize();
    let distance = geolib.getDistance(baseLocation, { longitude, latitude });

    return { name, duration, longitude, latitude, expirationTime, distance };
  }
}

function sortPokemon(pokemonA, pokemonB) {
  return pokemonA.distance - pokemonB.distance;
}

function filterBoringPokemon(pokemon) {
  return FILTER_POKEMON.indexOf(pokemon.name) === -1;
}

function getPokemonByAddress(address) {
  let baseLocation;
  return geocoder.geocode(address).then(result => {
    baseLocation = result[0] || { longitude: 0, latitude: 0 };
    return baseLocation;
  }).then(getPokemonAround).then(pokemon => {
    return {
      result: pokemon.map(extractPokeInfo(baseLocation)).filter(filterBoringPokemon).sort(sortPokemon),
      location: baseLocation
    }
  });
}

function formatText(pokeList, location,locationStr = '') {
  let formattedPokemon = pokeList.slice(0, TAKE_COUNT).map(pokemon => {
    return `${pokemon.name}, ${pokemon.distance}m, ${pokemon.duration}`;
  }).join(`\n`)
  return `There are the following Pokemon around ${locationStr}:
${formattedPokemon}
${getPokevisionUrl(location)}`;
}

function getPokevisionUrl(location) {
  return `https://pokevision.com/#/@${location.latitude},${location.longitude}`;
}

function subscribe(pokeName, location, number) {
  SubscribeMap.set(`${number},${pokeName}`, location);
}

function checkForPokemon() {
  console.log('Checking for pokemon...');
  for (let [infoStr, locationStr] of SubscribeMap) {
    let infoArr = infoStr.split(',');
    let info = {
      number: infoArr[0],
      pokeName: infoArr[1]
    }
    getPokemonByAddress(locationStr).then(item => {
      let { location, result } = item;
      let availablePokemon = result.filter(pokemon => pokemon.name === info.pokeName);
      if (availablePokemon.length !== 0) {
        let body = formatText(availablePokemon, location, locationStr);
        let from = 'POKEWATCH';
        let to = info.number;
        console.log(`FOUND ${availablePokemon[0].name}`);
        SubscribeMap.delete(infoStr);
        return client.sendMessage({body, from, to});
      }
      return Promise.resolve(true);
    });
  }
}

setInterval(checkForPokemon, 30*1000);

app.get('/:address', (req, res) => {
  getPokemonByAddress(req.params.address).then(item => {
    let { location, result } = item;
    res.type('text/plain').send(formatText(result, location));
  });
});

app.post('/incoming', (req, res) => {
  let message = req.body.Body.replace(/https:\/\/goo.gl\/maps\/[A-Za-z0-9]*$/, '');
  if (message.toLowerCase().trim().indexOf('subscribe:') === 0) {
    message = message.substr('subscribe:'.length);
    let [name, location] = message.split(';').map(m => m.trim());
    subscribe(name, location, req.body.From);
    res.type('text/plain').send(`We will be on the look for ${name}`);
  } else {
    console.log(`Address: ${req.body.Body}`);
    getPokemonByAddress(req.body.Body).then(item => {
      let { location, result } = item;
      let targetPhoneNumber = req.body.From;
      let senderPhoneNumber = req.body.To;
      let message = formatText(result, location);
      return client.sendMessage({
        from: senderPhoneNumber,
        to: targetPhoneNumber,
        body: message
      }).then(() => {
        res.status(200).send();
      });
    });
  }
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});