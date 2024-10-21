---
outline: [1,2]
---

# Getting Started

We're happy to have you here! Feel free to reach out with any questions on our [Discord](https://discord.gg/4hXgz9EsF4).

## Docker Compose

If you're familiar with [Docker](https://docs.docker.com/engine/install/), we suggest you use our hosted Docker images.

Create a new folder with a fresh `docker-compose.yml` file and copy it from below. The original file can be found on [GitHub](https://github.com/matvp91/superstreamer/tree/main/docker/docker-compose.yml).

::: code-group

```yml [docker-compose.yml]
version: "3"

volumes:
  superstreamer_redis_data:

services:
  superstreamer-app:
    image: "superstreamerapp/app:latest"
    ports:
      - 52000:52000
    env_file: config.env

  superstreamer-api:
    image: "superstreamerapp/api:latest"
    restart: always
    ports:
      - 52001:52001
    depends_on:
      - superstreamer-redis
    env_file: config.env
    environment:
      - REDIS_HOST=superstreamer-redis
      - REDIS_PORT=6379

  superstreamer-stitcher:
    image: "superstreamerapp/stitcher:latest"
    restart: always
    ports:
      - 52002:52002
    depends_on:
      - superstreamer-redis
    env_file: config.env
    environment:
      - REDIS_HOST=superstreamer-redis
      - REDIS_PORT=6379

  superstreamer-artisan:
    image: "superstreamerapp/artisan:latest"
    restart: always
    depends_on:
      - superstreamer-redis
    env_file: config.env
    environment:
      - REDIS_HOST=superstreamer-redis
      - REDIS_PORT=6379

  superstreamer-redis:
    image: redis/redis-stack-server:7.2.0-v6
    ports:
      - 127.0.0.1:6379:6379
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
    volumes:
      - superstreamer_redis_data:/data
```

:::

Create a `config.env` file in the same folder. The original example can be found on [GitHub](https://github.com/matvp91/superstreamer/blob/main/config.env.example).

::: code-group

```sh [config.env]
S3_ENDPOINT=
S3_REGION=us-east-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=superstreamer
PUBLIC_API_ENDPOINT=http://localhost:52001
PUBLIC_STITCHER_ENDPOINT=http://localhost:52002
PUBLIC_S3_ENDPOINT=https://s3.us-east-1.amazonaws.com/superstreamer
```

:::

If you'd like to change the port of each service individually, provide the `PORT` environment variable.

Start the necessary services with [Docker Compose](https://docs.docker.com/compose/).

::: code-group

```sh [shell]
$ docker compose up -d
```

:::

By default, we host the app on port `52000`. Open `http://127.0.0.1:52000` in your browser, and you're all set!

::: info
In a scalable architecture, you probably do not want to run the ffmpeg and transcode workers on the same machine as your api or the stitcher.
:::

## Local builds

One of our main goals is to help you get up and running locally with minimal hassle. Superstreamer is organized as a monorepo, and each service or app comes with its own `build` script. You can build the entire project and all its packages with just a single command. The backend services use Bun, while the frontend app and player are built with Vite. Superstreamer relies on a unified environment variable setup, the `config.env` file at the root of the project.

### Prerequisites

- Redis, we suggest [Redis Stack](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/).
- [Bun](https://bun.sh/) v1.1.30 or above.
- [pnpm](https://pnpm.io/installation) as package manager.

### Install dependencies

First, we're going to install a couple of dependencies. Run the following commands at the root of the project.

::: code-group

```sh [shell]
# Install node dependencies
$ pnpm install
# Install binary dependencies, such as ffmpeg
$ pnpm install-bin

```

:::

Each package now contains a `node_modules` folder, and optionally a `bin` folder when necessary.

### Build packages

Before we build, we're going to configure a few environment variables first.

::: code-group

```sh [shell]
$ cp config.env.example config.env
# Edit config.env with your own variables
```

If you'd like to use a local S3 setup, we recommend [LocalStack](https://www.localstack.cloud/), a fully functional local AWS cloud stack that enables developers to test and develop cloud applications offline. While we definitely don't need an entire AWS-like setup, we can use the S3 part.

:::

Next up, we're going to build the different packages into their single Javascript files. The bundling for services happens under the hood with Bun, and each client package is built with Vite. The build files are created in the `dist` folder of each package respectively.

::: code-group

```sh [shell]
$ pnpm build
```

:::

### Up and Running

Now that we have each package build, let's run them locally.

::: code-group

```sh [shell]
# Run the api, default port is 52001
$ bun packages/api/dist/index.js

# Run artisan, the job runner
$ bun packages/artisan/dist/consumer/index.js

# Run the stitcher, default port is 52002
$ bun packages/stitcher/dist/index.js
```

:::

If you'd like to interact with the API, or with Stitcher, run the app. It's a single page application (SPA), you can host it statically everywhere you like. When the app is build, it'll read the `PUBLIC_` environment variables from the config file at the root of the project and include these into the Javascript bundles. If you'd like to run the app locally, you can use our dev script.

::: code-group

```sh [shell]
$ pnpm --filter="@superstreamer/app" dev
```

:::

If you'd like to host the app elsewhere, all files can be found in `packages/app/dist`.

### Development

We’ve already covered how to build Superstreamer locally, and we’ve also made it easy to start developing on the project. Just run `pnpm dev` from the root of the project, and it will launch all the services, including the app. Head over to `http://localhost:52000`, and you’ll be welcomed by the app!

::: code-group

```sh [shell]
$ pnpm dev
```

:::