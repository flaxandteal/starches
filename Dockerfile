FROM node:23.10.0 as node
ARG STARCHES_INCLUDE_PRIVATE=0

WORKDIR /app
COPY package.json package.json
# COPY package-lock.json package-lock.json

RUN npm install --include=dev

COPY . .
COPY pagefind-bin pagefind-bin
RUN chmod +x pagefind-bin
RUN curl -O -L https://github.com/gohugoio/hugo/releases/download/v0.147.7/hugo_0.147.7_linux-amd64.tar.gz && tar -xzf hugo_0.147.7_linux-amd64.tar.gz
RUN ./hugo

ENV STARCHES_INCLUDE_PRIVATE=$STARCHES_INCLUDE_PRIVATE
RUN echo STARCHES_INCLUDE_PRIVATE=$STARCHES_INCLUDE_PRIVATE && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/registries.json REG_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/bibliography_merged.json BIB_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/gardens_merged.json GDN_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ihr_merged_mp.json IHR_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/aai_merged.json AAI_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/aap_merged.json AAP_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ghnus_merged.json GHN_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/marine_merged.json MAR_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/marine_merged_loss.json MAL_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/dhr_merged.json DHR_ -a prebuild/business_data/creators.json prebuild/business_data/creators_organization.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/har_merged.json HAR_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/excavations_merged_licence.json ELC_ -a prebuild/business_data/licencees.json -a prebuild/business_data/company_organization.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/excavations_merged.json EXC_ -a prebuild/business_data/excavations_merged_licence.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/archive_merged_new.json ARC_ -a prebuild/business_data/excavations_merged_licence.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ss_action_merged.json SSA_ && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ss_har_merged_0.json SSH_ -a prebuild/business_data/surveyors.json -a prebuild/business_data/ss_action_merged.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ss_har_merged_1.json SSH_ -a prebuild/business_data/surveyors.json -a prebuild/business_data/ss_action_merged.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ss_har_merged_2.json SSH_ -a prebuild/business_data/surveyors.json -a prebuild/business_data/ss_action_merged.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ss_har_merged_3.json SSH_ -a prebuild/business_data/surveyors.json -a prebuild/business_data/ss_action_merged.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ss_har_merged_4.json SSH_ -a prebuild/business_data/surveyors.json -a prebuild/business_data/ss_action_merged.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/ss_har_merged_5.json SSH_ -a prebuild/business_data/surveyors.json -a prebuild/business_data/ss_action_merged.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/buildings_merged_mp_0.json BDG_ -a prebuild/business_data/architects.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/buildings_merged_mp_1.json BDG_ -a prebuild/business_data/architects.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/buildings_merged_mp_2.json BDG_ -a prebuild/business_data/architects.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/buildings_merged_mp_3.json BDG_ -a prebuild/business_data/architects.json && \
    ./node_modules/.bin/ts-node utils/preindex.ts prebuild/business_data/monuments_merged_mp.json MNT_

RUN PAGEFIND_BINARY_PATH=./pagefind-bin ./node_modules/.bin/ts-node utils/reindex.ts
RUN cd docs && tar -cf ../docs.tar *

FROM nginxinc/nginx-unprivileged:1.21.5-alpine
COPY --from=node /app/docs.tar /usr/share/nginx/html/
RUN tar -xf docs.tar && rm -f docs.tar
USER 33
EXPOSE 8080
