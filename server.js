const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Add file type restrictions if needed
    cb(null, true);
  }
});

// Upload file to S3
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const fileKey = `${Date.now()}-${req.file.originalname}`;
    
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'private' // or 'public-read' if you want public access
    };

    const result = await s3.upload(uploadParams).promise();
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        key: fileKey,
        location: result.Location,
        bucket: result.Bucket,
        etag: result.ETag
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload file',
      details: error.message 
    });
  }
});

// Get list of files from S3
app.get('/api/files', async (req, res) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      MaxKeys: 1000 // Adjust as needed
    };

    const result = await s3.listObjectsV2(params).promise();
    
    const files = result.Contents.map(file => ({
      key: file.Key,
      lastModified: file.LastModified,
      size: file.Size,
      etag: file.ETag
    }));

    res.json({
      success: true,
      files: files,
      count: files.length
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve files',
      details: error.message 
    });
  }
});

// Download file from S3
app.get('/api/download/:key', async (req, res) => {
  try {
    const fileKey = req.params.key;
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileKey
    };

    // Check if file exists
    try {
      await s3.headObject(params).promise();
    } catch (headError) {
      if (headError.code === 'NotFound') {
        return res.status(404).json({ error: 'File not found' });
      }
      throw headError;
    }

    // Get the file
    const fileStream = s3.getObject(params).createReadStream();
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${fileKey}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Failed to download file',
      details: error.message 
    });
  }
});

// Get file URL (signed URL for private files)
app.get('/api/file-url/:key', async (req, res) => {
  try {
    const fileKey = req.params.key;
    const expiration = parseInt(req.query.expires) || 3600; // Default 1 hour
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Expires: expiration
    };

    const url = await s3.getSignedUrlPromise('getObject', params);
    
    res.json({
      success: true,
      url: url,
      expires: expiration
    });
  } catch (error) {
    console.error('Get URL error:', error);
    res.status(500).json({ 
      error: 'Failed to generate file URL',
      details: error.message 
    });
  }
});

// Delete file from S3
app.delete('/api/delete/:key', async (req, res) => {
  try {
    const fileKey = req.params.key;
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileKey
    };

    await s3.deleteObject(params).promise();
    
    res.json({
      success: true,
      message: 'File deleted successfully',
      key: fileKey
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      error: 'Failed to delete file',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;