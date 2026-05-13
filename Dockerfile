#
# this dockerfile is not required to use swan-vault-recovery-assistant (SVRA),
# but can be useful  for building in a controlled environment and for
# prototyping changes to the github actions.
#
# this is a base image similar to github action, rather than a base node or
# rust image. slim images or multi-stage is not necessary since this is not
# being deployed. 
# this image takes a long time to build without cached layers.
#
# build:
# docker build --tag svra:latest .
#
# copy build artifacts out of the container:
# docker run -it --rm --name svra svra
# docker container cp svra:/svra/src-tauri/target/release/bundle/deb/swan-vault-recovery-assistant_<symver>_amd64.deb .
#
FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
  build-essential \
  curl \
  file \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \ 
  librsvg2-dev \
  npm

# install rust & pnpm
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
# Pin pnpm to a major to match CI (build.yml/test.yml use pnpm v9 via the
# private-actions wrapper). Corepack will read package.json `packageManager`
# and use the integrity-pinned exact version when commands run inside /svra.
RUN npm install -g pnpm@9

# copy, install dependencies build
WORKDIR /svra
COPY . .
# `--frozen-lockfile` matches CI; install scripts are blocked via .npmrc
# (`ignore-scripts=true`), so HWI fetch is now an explicit step before
# `pnpm tauri build`. HUSKY=0 short-circuits the husky prepare hook for
# containerized builds with no git working tree.
RUN HUSKY=0 pnpm install --frozen-lockfile \
  && pnpm run fetch:hwi \
  && pnpm tauri build