// src/routes/searchCriteria.js
const express = require('express');
const router = express.Router();

const Client = require('../models/Client');
const SearchCriteria = require('../models/SearchCriteria');

function toPositiveInt(raw, fieldName) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    return {
      error: `${fieldName} must be a positive integer`,
    };
  }
  return { value: num };
}

// Валидация тела для создания SearchCriteria
function validateCreateCriteriaBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Body must be a JSON object' };
  }

  const { country, sourceSite, searchUrl } = body;

  const allowedCountries = ['Korea', 'China', 'Europe'];
  if (typeof country !== 'string' || !allowedCountries.includes(country)) {
    return {
      error: `country must be one of: ${allowedCountries.join(', ')}`,
    };
  }

  if (typeof searchUrl !== 'string' || searchUrl.trim().length === 0) {
    return { error: 'searchUrl must be a non-empty string' };
  }

  let normalizedSourceSite = null;
  if (typeof sourceSite !== 'undefined' && sourceSite !== null) {
    if (typeof sourceSite !== 'string' || sourceSite.trim().length === 0) {
      return { error: 'sourceSite, if provided, must be a non-empty string' };
    }
    normalizedSourceSite = sourceSite.trim();
  }

  return {
    error: null,
    value: {
      country,
      sourceSite: normalizedSourceSite,
      searchUrl: searchUrl.trim(),
    },
  };
}

// POST /clients/:clientId/search-criteria
router.post('/clients/:clientId/search-criteria', (req, res) => {
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

  const { error, value } = validateCreateCriteriaBody(req.body);
  if (error) {
    return res.status(400).json({
      error: 'ValidationError',
      message: error,
    });
  }

  try {
    const created = SearchCriteria.create({
      clientId,
      country: value.country,
      sourceSite: value.sourceSite,
      searchUrl: value.searchUrl,
    });
    return res.status(201).json(created);
  } catch (e) {
    console.error('Error creating search criteria:', e);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Could not create search criteria',
    });
  }
});

// GET /clients/:clientId/search-criteria
router.get('/clients/:clientId/search-criteria', (req, res) => {
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

  const list = SearchCriteria.findByClient(clientId);
  return res.json(list);
});

module.exports = router;

