# Pokemon Go SMS notifier
Let's you query for Pokemon on Pokemon Go via SMS. This was created during a [Twitch stream](https://twitch.tv/twilio).

## Deploy locally

1. [Get a Twilio account](https://twilio.com/try-twilio)
2. Clone repo
3. Run `npm install`
4. Add the respective environment variables described in the app.json file to your system.
5. Run `npm start`
6. Expose the server via [ngrok](https://ngrok.com)
7. Buy a Twilio phone number, configure the incoming message webhook to point to: `http://<your ngrok code>.ngrok.io/incoming`

# Contributors

Dominik Kundel
