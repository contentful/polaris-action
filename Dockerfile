# nodeJs base image
FROM node:slim

ARG POLARIS_SERVER_URL
ARG POLARIS_ACCESS_TOKEN
ARG POLARIS_VERSION="2024.12.0"

ENV INSTALL_DIR /tmp
ENV PATH "$INSTALL_DIR/bin:$PATH"
ENV SSL_CERT_FILE=/usr/local/share/ca-certificates/Entrust-OVTLS-I-R1.crt
# ENV POLARIS_HOME=/root/polaris

RUN apt-get update \
    && apt-get install -y curl ca-certificates unzip git jq bash openssl golang-go

# Install certificates properly
RUN curl -o /usr/local/share/ca-certificates/Entrust-OVTLS-I-R1.crt http://cert.ssl.com/Entrust-OVTLS-I-R1.cer && \
    chmod 644 /usr/local/share/ca-certificates/Entrust-OVTLS-I-R1.crt && \
    update-ca-certificates

SHELL ["/bin/bash", "-c"]

WORKDIR /root

RUN curl --cacert /usr/local/share/ca-certificates/Entrust-OVTLS-I-R1.crt -o polaris_cli-linux64.zip -fsLOS $POLARIS_SERVER_URL/api/tools/polaris_cli-linux64-${POLARIS_VERSION}.zip \
    && unzip -j polaris_cli-linux64.zip -d $INSTALL_DIR/bin

RUN CURL_CA_BUNDLE=/usr/local/share/ca-certificates/Entrust-OVTLS-I-R1.crt polaris --co analyze.mode=local --co capture.build.coverity.cov-build="[--desktop]" install

# copy app code
COPY ./dist ./dist

COPY entrypoint.sh .
COPY .polaris.yml .

# deletes temp token
# RUN rm .synopsys/polaris/.api_token.txt

ENTRYPOINT ["/root/entrypoint.sh"]
# ENTRYPOINT ["/bin/bash"]
