'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const moment = require('moment');
const geocoder = require('node-geocoder')({ provider: 'openstreetmap' });

const app = express();

app.use(bodyParser.json({})) 
app.use(bodyParser.urlencoded({
  extended: true
}));

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

function extractPokeInfo(pokemon) {
  let { longitude, latitude } = pokemon;
  let expirationTime = pokemon.expiration_time;
  let name = POKEDEX[pokemon.pokemonId];
  let duration = moment.duration(expirationTime * 1000 - Date.now()).humanize();

  return { name, duration, longitude, latitude, expirationTime };
}

function sortPokemon(pokemonA, pokemonB) {
  return pokemonA.expirationTime - pokemonB.expirationTime;
}

function getPokemonByAddress(address) {
  return geocoder.geocode(address).then(result => {
    return result[0] || { longitude: 0, latitude: 0 };
  }).then(getPokemonAround).then(pokemon => {
    return pokemon.map(extractPokeInfo).sort(sortPokemon);
  });
}

app.get('/:address', (req, res) => {
  getPokemonByAddress(req.params.address).then(result => {
    res.send({result});
  });
});

app.post('/incoming', (req, res) => {
  console.log(`Address: ${req.body.Body}`);
  getPokemonByAddress(req.body.Body).then(result => {
    res.type('text/plain').send(`There are ${result.length} Pokemon around.`);
  });
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});