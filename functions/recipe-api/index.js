'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function httpResponse(body, statusCode = 200) {
  return {
    isBase64Encoded: false,
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function extractParams(event) {
  if (event && event.action) {
    return event;
  }
  if (event && event.httpMethod && event.body) {
    try {
      return JSON.parse(event.body);
    } catch (e) {
      throw new Error('Invalid JSON body');
    }
  }
  return event || {};
}

async function handleAction(params) {
  const action = params.action;
  if (action === 'list') {
    const result = await pool.query('SELECT * FROM dishes ORDER BY created_at DESC');
    return { data: result.rows };
  }
  if (action === 'add') {
    const { name, category, rating, notes, date } = params;
    if (!name) throw new Error('name is required');
    const result = await pool.query(
      'INSERT INTO dishes (name,category,rating,notes,date,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [name, category || '其他', rating || 3, notes || '', date || '', Date.now()]
    );
    return { id: result.rows[0].id };
  }
  if (action === 'update') {
    const { id, name, category, rating, notes, date } = params;
    await pool.query(
      'UPDATE dishes SET name=$1,category=$2,rating=$3,notes=$4,date=$5 WHERE id=$6',
      [name, category, rating, notes, date, id]
    );
    return { ok: true };
  }
  if (action === 'delete') {
    const { id } = params;
    await pool.query('DELETE FROM dishes WHERE id=$1', [id]);
    return { ok: true };
  }
  throw new Error('Unknown action: ' + action);
}

// 把 isHttpTrigger 提升到函数顶部，catch 块也能访问
exports.main = async function(event) {
  var isHttpTrigger;
  try {
    isHttpTrigger = event && (event.httpMethod || event.path);
    if (isHttpTrigger) {
      if (event.httpMethod === 'OPTIONS') {
        return httpResponse(null, 204);
      }
      if (event.httpMethod !== 'POST') {
        return httpResponse({ error: 'Method not allowed' }, 405);
      }
      const result = await handleAction(extractParams(event));
      return httpResponse(result);
    } else {
      const result = await handleAction(extractParams(event));
      return result;
    }
  } catch (err) {
    if (isHttpTrigger) {
      return httpResponse({ error: err.message }, 500);
    } else {
      return { error: err.message };
    }
  }
};
