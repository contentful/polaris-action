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

WORKDIR /tmp

RUN curl -o polaris_cli-linux64.zip -fsLOS $POLARIS_SERVER_URL/api/tools/polaris_cli-linux64-${POLARIS_VERSION}.zip \
    && unzip -j polaris_cli-linux64.zip -d $INSTALL_DIR/bin

# Override parameters are necessary to install the coverity local tools
RUN polaris --co analyze.mode=local --co capture.build.coverity.cov-build="[--desktop]" install

WORKDIR /root

# copy app code
COPY ./dist .

ENTRYPOINT ["/root/entrypoint.sh"]