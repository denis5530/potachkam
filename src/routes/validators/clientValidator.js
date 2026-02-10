// src/routes/validators/clientValidator.js

function toPositiveInt(raw, fieldName) {
    const num = Number(raw);
    if (!Number.isInteger(num) || num <= 0) {
      return {
        error: `${fieldName} must be a positive integer`,
      };
    }
    return { value: num };
  }
  
  // Валидация тела POST /clients
  function validateCreateClientBody(body) {
    if (!body || typeof body !== 'object') {
      return { error: 'Body must be a JSON object' };
    }
  
    const { partnerId, name } = body;
  
    // partnerId: обязательный положительный int
    const partnerIdCheck = toPositiveInt(partnerId, 'partnerId');
    if (partnerIdCheck.error) {
      return { error: partnerIdCheck.error };
    }
  
    // name: обязательная непустая строка
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { error: 'name must be a non-empty string' };
    }
  
    return {
      error: null,
      value: {
        partnerId: partnerIdCheck.value,
        name: name.trim(),
      },
    };
  }
  
  // Валидация params.id для GET /clients/:id
  function validateClientIdParam(rawId) {
    const { error, value } = toPositiveInt(rawId, 'id');
    if (error) {
      return { error };
    }
  
    return { error: null, id: value };
  }
  
  // Валидация params.partnerId для GET /partners/:partnerId/clients
  function validatePartnerIdParam(rawPartnerId) {
    const { error, value } = toPositiveInt(rawPartnerId, 'partnerId');
    if (error) {
      return { error };
    }
  
    return { error: null, partnerId: value };
  }
  
  module.exports = {
    validateCreateClientBody,
    validateClientIdParam,
    validatePartnerIdParam,
  };