FROM node:14.8.0
RUN npm install -g -s --no-progress yarn@1.9.4

RUN mkdir -p /code
WORKDIR /code

COPY . /code

RUN yarn install --production && yarn cache clean

CMD ["yarn","start"]

EXPOSE 8080
