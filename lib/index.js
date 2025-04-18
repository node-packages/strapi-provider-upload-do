"use strict";
const AWS = require('aws-sdk');
const uri = require('fast-uri');
const crypto = require('crypto');

class FileLocationConverter {
  constructor(config) {
    this.config = config;
  }

  getKey(file) {
    const filename = `${file.hash}${file.ext}`;
    return this.config.directory
      ? `${this.config.directory}/${filename}`
      : filename;
  }

  getUrl(data) {
    if (!this.config.cdn) {
      if (!this.assertUrlProtocol(data.Location)) {
        return `https://${data.Location}`;
      }

      return data.Location;
    }

    const urlParts = uri.parse(this.config.cdn);
    urlParts.scheme = "https"; // force https
    urlParts.path = data.Key;
    return uri.serialize(urlParts);
  }

  assertUrlProtocol = (url) => {
    // Regex to test protocol like "http://", "https://"
    return /^\w*:\/\//.test(url);
  };
}

module.exports = {
  provider: "do",
  name: "Digital Ocean Spaces",
 
  init: config => {
    const endpoint = new AWS.Endpoint(config.endpoint);
    const converter = new FileLocationConverter(config);
    const s3Config = {
      endpoint,
      accessKeyId: config.key,
      secretAccessKey: config.secret,
      params: {
        ACL: 'public-read',
        Bucket: config.space,
        CacheControl: 'public, max-age=31536000, immutable'
      }
    };

    const S3 = new AWS.S3(s3Config);

    return {
      upload: file => {
        file.hash = crypto.createHash(config.hash || 'md5').update(file.hash).digest("hex");
        
        return S3.upload({
          Key: converter.getKey(file),
          Body: file.stream || Buffer.from(file.buffer, "binary"),
          ContentType: file.mime
        }).promise()
          .then(data => {
            file.url = converter.getUrl(data);
          });
      },

      delete: file => {
        return S3.deleteObject({
          Bucket: config.bucket,
          Key: converter.getKey(file)
        }).promise();
      }
    };
  }
};
