'use strict';

const express = require('express');
const bodyParser = require('body-parser');

const app = express();

const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({})) 
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/:address', (req, res) => {
  res.type('text/plain').send(`Ahoy! ${req.params.address}`);
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});