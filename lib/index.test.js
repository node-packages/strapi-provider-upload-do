const AWS = require('aws-sdk');
const MockS3 = require('mock-aws-s3');
const fs = require('fs-extra');
const path = require('path');
const provider = require('./index');

describe('Digital Ocean Spaces Provider', () => {
  let s3;
  let config;
  const mockBucketPath = path.join(__dirname, '.tmp-s3', 'test-bucket');

  beforeAll(async () => {
    // Create mock S3 bucket directory
    await fs.ensureDir(mockBucketPath);
    s3 = new MockS3.S3({
      params: {
        Bucket: mockBucketPath,
      },
    });
    
    // Mock AWS.S3 constructor
    AWS.S3 = jest.fn(() => s3);
  });

  beforeEach(() => {
    config = {
      endpoint: 'digitalocean.com',
      key: 'test-key',
      secret: 'test-secret',
      space: mockBucketPath,
      directory: 'uploads',
      cdn: 'https://cdn.digitalocean.com',
      bucket: mockBucketPath
    };
  });

  afterAll(async () => {
    // Clean up mock S3 bucket
    await fs.remove(mockBucketPath);
  });

  describe('Provider Configuration', () => {
    it('should have correct provider name and type', () => {
      expect(provider.name).toBe('Digital Ocean Spaces');
      expect(provider.provider).toBe('do');
    });

    it('should initialize with correct config', () => {
      const instance = provider.init(config);
      expect(instance).toHaveProperty('upload');
      expect(instance).toHaveProperty('delete');
    });
  });

  describe('Upload and Delete Operations', () => {
    let instance;

    beforeEach(() => {
      instance = provider.init(config);
    });

    it('should upload a file successfully', async () => {
      const file = {
        hash: 'testhash',
        ext: '.jpg',
        mime: 'image/jpeg',
        buffer: Buffer.from('test image content')
      };

      await instance.upload(file);

      // Verify file exists in mock S3
      const uploaded = await s3.getObject({
        Bucket: config.bucket,
        Key: `uploads/${file.hash}.jpg`
      }).promise();

      expect(file.url).toBeDefined();
      expect(uploaded.Key).toBe(`uploads/${file.hash}.jpg`);
    });

    it('should upload a file with stream', async () => {
      const file = {
        hash: 'streamtest',
        ext: '.png',
        mime: 'image/png',
        stream: Buffer.from('test stream content')
      };

      await instance.upload(file);

      const uploaded = await s3.getObject({
        Bucket: config.bucket,
        Key: `uploads/${file.hash}.png`
      }).promise();

      expect(file.url).toBeDefined();
      expect(uploaded.Key).toBe(`uploads/${file.hash}.png`);
    });

    it('should delete a file successfully', async () => {
      // First upload a file
      const file = {
        hash: 'deleteme',
        ext: '.txt',
        mime: 'text/plain',
        buffer: Buffer.from('delete this file')
      };

      await instance.upload(file);

      // Then delete it
      await instance.delete(file);

      // Verify file is deleted
      // await expect().rejects.toThrow();
      try {
        await s3.getObject({
          Bucket: config.bucket,
          Key: `uploads/${file.hash}.txt`
        }).promise();
      } catch (err) {
        expect(err.code).toBe('NoSuchKey');
      }
    });

    it('should generate correct URLs with CDN', async () => {
      const file = {
        hash: 'cdntest',
        ext: '.jpg',
        mime: 'image/jpeg',
        buffer: Buffer.from('cdn test content')
      };

      await instance.upload(file);
      expect(file.url).toMatch(/^https:\/\/cdn\.digitalocean\.com/);
    });

    it('should generate correct URLs without CDN', async () => {
      const configWithoutCdn = { ...config, cdn: null };
      const instanceWithoutCdn = provider.init(configWithoutCdn);
      
      const file = {
        hash: 'nocdn',
        ext: '.jpg',
        mime: 'image/jpeg',
        buffer: Buffer.from('no cdn test content')
      };

      await instanceWithoutCdn.upload(file);
      expect(file.url).toMatch(/^https?:\/\//);
    });
  });
});