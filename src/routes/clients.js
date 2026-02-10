// src/routes/clients.js
const express = require('express');
const router = express.Router();

// Модель клиента
const Client = require('../models/Client');

// Валидаторы входных данных для клиентов
const {
  validateCreateClientBody,
  validateClientIdParam,
  validatePartnerIdParam,
} = require('./validators/clientValidator');

// POST /clients
router.post('/clients', (req, res) => {
  const { error, value } = validateCreateClientBody(req.body);
  if (error) {
    return res.status(400).json({
      error: 'ValidationError',
      message: error,
    });
  }

  try {
    const createdClient = Client.create({
      partnerId: value.partnerId,
      name: value.name,
    });

    return res.status(201).json(createdClient);
  } catch (e) {
    // здесь можно различать типы ошибок (например, нарушение FK по partner_id)
    console.error('Error creating client:', e);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Could not create client',
    });
  }
});

// GET /clients/:id
router.get('/clients/:id', (req, res) => {
  const { error, id } = validateClientIdParam(req.params.id);
  if (error) {
    return res.status(400).json({
      error: 'ValidationError',
      message: error,
    });
  }

  const client = Client.findById(id);
  if (!client) {
    return res.status(404).json({
      error: 'NotFound',
      message: 'Client not found',
    });
  }

  return res.json(client);
});

// GET /partners/:partnerId/clients
router.get('/partners/:partnerId/clients', (req, res) => {
  const { error, partnerId } = validatePartnerIdParam(req.params.partnerId);
  if (error) {
    return res.status(400).json({
      error: 'ValidationError',
      message: error,
    });
  }

  const clients = Client.findByPartnerId(partnerId);
  return res.json(clients);
});

module.exports = router;

