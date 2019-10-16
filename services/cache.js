const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function (options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');

  return this;
}

mongoose.Query.prototype.exec = async function () {
  if (!this.useCache) {
    console.log('using mongo')
    return exec.apply(this, arguments);
  }
  const key = JSON.stringify({
    ...this.getQuery(),
    collection: this.mongooseCollection.name
  });

  const cacheValue = await client.hget(this.hashKey, key);

  if (cacheValue) {
    console.log('using cache')
    const doc = JSON.parse(cacheValue);
    return Array.isArray(doc)
    ? doc.map(d => new this.model(d))
    : new this.model(doc);
  }

  console.log('using mongo')

  const result = await exec.apply(this, arguments);

  client.hset(this.hashKey, key, JSON.stringify(result));

  return result;
};

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey))
  }
}
