# Centerflow

create a webapp to manage personal tasks. the main capability of this web us that alows users to integrate with all the daily tools they use: jira, outlook, notion, etc, therefore is super important to have a robust config module where they can select conectors to these tools and the background of the app should enable and ask for credentials.

now, on the main pages, keep in mind 3 for now, 1 for tasks and current status where elements from these mentioend tools come and are displayed in card-style elements. you should keep kind of a timeline grouping: now, soon, done; also a page for reporting and historical data and another for chating with an AI chatbot that is capable of interacting with the info from all these tools (therefore in the config module consider a section to enter API keys and credentials for AI models such us anthropic or openAI ones).

if you have questions before building ask

the design should follow the material desing one as much as possible:
https://github.com/material-components/material-web

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7449e361-1375-4be0-b340-0327aa810701).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
