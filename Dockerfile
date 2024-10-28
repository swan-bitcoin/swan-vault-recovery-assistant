#
# this dockerfile is not required to use tempura, but can be useful for building 
# in a controlled environment and for prototyping changes to the github actions.
#
# this is a base image similar to github action, rather than a base node or rust image.
# slim images or multi-stage is not necessary since this is not being deployed.
# this image takes a long time to build without cached layers.
#
# build:
# docker build --tag tempura .
#
# copy build artifacts out of the container:
# docker run --it --rm --name tempura tempura
# docker container cp tempura:/tempura/src-tauri/target/release/bundle/deb/tempura_<symver>_amd64.deb .
#
FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
  build-essential \
  curl \
  wget \
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
RUN npm install -g pnpm

# copy, install dependencies build
WORKDIR /tempura
COPY . .
RUN pnpm install -f && pnpm tauri build