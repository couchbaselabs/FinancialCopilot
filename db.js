const couchbase = require('couchbase');

let cluster, bucket, scope, collections = {};

async function connect() {
  if (cluster) return { cluster, bucket, scope, collections };

  const connectionString = process.env.CB_ENDPOINT;
  const username = process.env.CB_USERNAME;
  const password = process.env.CB_PASSWORD;
  const bucketName = process.env.CB_BUCKET || 'portfolio';

  cluster = await couchbase.connect(connectionString, {
    username,
    password,
    timeouts: { kvTimeout: 10000 },
  });

  bucket = cluster.bucket(bucketName);
  scope = bucket.defaultScope();

  collections.holdings = bucket.defaultCollection();
  collections.transactions = bucket.defaultCollection();
  collections.portfolio = bucket.defaultCollection();

  console.log('✅ Connected to Couchbase Capella');
  return { cluster, bucket, scope, collections };
}

async function query(statement, params = {}) {
  const { cluster } = await connect();
  const result = await cluster.query(statement, { parameters: params });
  return result.rows;
}

module.exports = { connect, query, getCollection: async (name) => {
  const { collections } = await connect();
  return collections[name] || collections.holdings;
}};
