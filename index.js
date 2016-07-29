'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const Pokespotter = require('pokespotter');
const geolib = require('geolib');
const moment = require('moment');
const geocoder = require('node-geocoder')({ provider: 'openstreetmap' });
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TinyUrl = require('tinyurl');

const app = express();

app.use(bodyParser.json({})) 
app.use(bodyParser.urlencoded({
  extended: true
}));

const PokeWatchers = new Map();
const PORT = process.env.PORT || 3000;
const POKEDEX = Pokespotter.Pokedex;
const spotter = Pokespotter();

function enhancePokeInfo(pokemon) {
  pokemon.duration = moment.duration(pokemon.expirationTime - Date.now()).humanize();
  return pokemon;
}

function sortClosestPokemon(pokemonA, pokemonB) {
  return pokemonA.distance - pokemonB.distance;
}

function filterCommon(pokemon) {
  let filter = process.env.POKEMON_FILTER || '';
  return filter.indexOf(pokemon.name) === -1;
}

function getPokemonByAddress(address) {
  return spotter.getNearby(address, { steps: 2, requestDelay: 100 }).then(pokemon => {
    return pokemon.map(enhancePokeInfo).filter(filterCommon).sort(sortClosestPokemon)
  });
}

function formatPokeList(pokeList, address) {
  let formattedPokemon = pokeList.map(pokemon => {
    return `${pokemon.name}, ${pokemon.distance}m, ${pokemon.duration}`;
  }).join(`\n`)
  return `There are the following Pokemon around ${address}:
${formattedPokemon}`;
}

app.get('/:address', (req, res) => {
  let address = req.params.address;
  getPokemonByAddress(address).then(pokemon => {
    res.type('text/plain').send(formatPokeList(pokemon, address));
  }).catch(err => {
    console.error(err);
  });
});

app.post('/incoming', (req, res) => {
  let message = req.body.Body;
  if (message.toLowerCase().trim().indexOf('subscribe:') === 0 && message.indexOf(';') !== -1) {
    message = message.substr('subscribe:'.length);
    let [pokemonName, location] = message.split(';').map(m => m.trim());

    if (POKEDEX.indexOf(pokemonName) !== -1) {
      PokeWatchers.set(`${req.body.From},${pokemonName}`, location);
      res.type('text/plain').send(`We will be on the watch for ${pokemonName} around ${location}`);
    } else {
      res.type('text/plain').send(`The Pokemon with the name "${pokemonName}" doesn't exist.`);
    }
  } else {
    getPokemonByAddress(message).then(pokemon => {
      let response = formatPokeList(pokemon, message);
      let mapsUrl = Pokespotter.getMapsUrl(message, pokemon, 2);
      TinyUrl.shorten(mapsUrl, (shortUrl) => {
        res.send(`<Response><Message>${response}\n${shortUrl}</Message></Response>`);
      });
    });
  }
});

function watchForPokemon() {
  console.log('Looking for Pokemon...');
  for(let [keyInfo, address] of PokeWatchers) {
    let [number, wantedPokemon] = keyInfo.split(',');
    getPokemonByAddress(address).then(pokemon => {
      let availablePokemon = pokemon.filter(poke => poke.name === wantedPokemon);
      if (availablePokemon.length !== 0) {
        let body = formatPokeList(availablePokemon, address);
        let from = 'POKEWATCH';
        let to = number;
        PokeWatchers.delete(keyInfo);
        return client.sendMessage({body, from, to});
      }
      return Promise.resolve(true);
    });
  }
}

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  watchForPokemon();
  setInterval(watchForPokemon, 2 * 60 * 1000);
});