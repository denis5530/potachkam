// src/routes/cars.js
const express = require('express');
const router = express.Router();

const Client = require('../models/Client');
const Car = require('../models/Car');

function toPositiveInt(raw, fieldName) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    return {
      error: `${fieldName} must be a positive integer`,
    };
  }
  return { value: num };
}

// Валидация тела для создания машины
function validateCreateCarBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Body must be a JSON object' };
  }

  const { title, description, price, imagesJson, sourceUrl } = body;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return { error: 'title must be a non-empty string' };
  }

  let normalizedDescription = null;
  if (typeof description !== 'undefined' && description !== null) {
    if (typeof description !== 'string') {
      return { error: 'description, if provided, must be a string' };
    }
    normalizedDescription = description;
  }

  let normalizedPrice = null;
  if (typeof price !== 'undefined' && price !== null && price !== '') {
    const num = Number(price);
    if (!Number.isFinite(num) || num <= 0) {
      return { error: 'price, if provided, must be a positive number' };
    }
    normalizedPrice = Math.round(num);
  }

  let normalizedImagesJson = null;
  if (typeof imagesJson !== 'undefined' && imagesJson !== null) {
    if (typeof imagesJson === 'string') {
      normalizedImagesJson = imagesJson;
    } else {
      // позволяем передавать массив/объект и сериализуем в JSON
      normalizedImagesJson = JSON.stringify(imagesJson);
    }
  }

  let normalizedSourceUrl = null;
  if (typeof sourceUrl !== 'undefined' && sourceUrl !== null) {
    if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
      return { error: 'sourceUrl, if provided, must be a non-empty string' };
    }
    normalizedSourceUrl = sourceUrl.trim();
  }

  return {
    error: null,
    value: {
      title: title.trim(),
      description: normalizedDescription,
      price: normalizedPrice,
      imagesJson: normalizedImagesJson,
      sourceUrl: normalizedSourceUrl,
    },
  };
}

// POST /clients/:clientId/cars
router.post('/clients/:clientId/cars', (req, res) => {
  const { error: idError, value: clientId } = toPositiveInt(
    req.params.clientId,
    'clientId'
  );
  if (idError) {
    return res.status(400).json({
      error: 'ValidationError',
      message: idError,
    });
  }

  const client = Client.findById(clientId);
  if (!client) {
    return res.status(404).json({
      error: 'NotFound',
      message: 'Client not found',
    });
  }

  const { error, value } = validateCreateCarBody(req.body);
  if (error) {
    return res.status(400).json({
      error: 'ValidationError',
      message: error,
    });
  }

  try {
    const created = Car.create({
      clientId,
      title: value.title,
      description: value.description,
      price: value.price,
      imagesJson: value.imagesJson,
      sourceUrl: value.sourceUrl,
    });
    return res.status(201).json(created);
  } catch (e) {
    console.error('Error creating car:', e);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Could not create car',
    });
  }
});

// GET /clients/:clientId/cars
router.get('/clients/:clientId/cars', (req, res) => {
  const { error: idError, value: clientId } = toPositiveInt(
    req.params.clientId,
    'clientId'
  );
  if (idError) {
    return res.status(400).json({
      error: 'ValidationError',
      message: idError,
    });
  }

  const client = Client.findById(clientId);
  if (!client) {
    return res.status(404).json({
      error: 'NotFound',
      message: 'Client not found',
    });
  }

  const list = Car.findByClient(clientId);
  return res.json(list);
});

module.exports = router;

