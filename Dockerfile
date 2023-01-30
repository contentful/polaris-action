# nodeJs base image
FROM node:slim

ARG POLARIS_SERVER_URL
ARG POLARIS_ACCESS_TOKEN
ARG POLARIS_VERSION="2022.12.0"

ENV INSTALL_DIR /tmp
ENV PATH "$INSTALL_DIR/bin:$PATH"

RUN apt-get update \
    && apt-get install -y curl ca-certificates unzip git jq bash openssl

SHELL ["/bin/bash", "-c"]

WORKDIR /root

RUN curl -o polaris_cli-linux64.zip -fsLOS $POLARIS_SERVER_URL/api/tools/polaris_cli-linux64-${POLARIS_VERSION}.zip \
    && unzip -j polaris_cli-linux64.zip -d $INSTALL_DIR/bin

# copy app code
COPY ./dist ./dist

ENV INPUT_POLARIS_ACCESS_TOKEN=$POLARIS_ACCESS_TOKEN
ENV INPUT_POLARIS_URL=$POLARIS_SERVER_URL
ENV INPUT_POLARIS_COMMAND='install'
RUN node ./dist/index.js

COPY entrypoint.sh .

# ENTRYPOINT ["/root/entrypoint.sh"]
ENTRYPOINT ["/bin/bash"]