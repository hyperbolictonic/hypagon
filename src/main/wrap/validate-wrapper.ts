/**
 * Wrapper validation and normalisation.
 *
 * The store and the bridge both call this. Invalid wrappers never reach disk,
 * and errors name the exact field so an agent can correct its own proposal.
 */

import { normalizeRecipe } from '../../../packages/recipe/src/index.ts';
import type { Recipe } from '../../../packages/recipe/src/index.ts';
import type { WrapInputSchema, WrapMethod, WrapRequest, WrapWrapper } from './types.ts';
import { isPlainObject } from './plain-object.js';
import { HTTP_METHODS, IDENTIFIER_PATTERN } from './identifiers.js';
import { normalizeWrapRequest } from './normalize-request.js';

export { isPlainObject } from './plain-object.js';

/** When to use: returning a validated wrapper document and its errors. */
export interface WrapperValidation {
  ok: boolean;
  wrapper?: WrapWrapper;
  errors: string[];
}

/** When to use: validating a wrapper before saving or running it. */
export function validateWrapper(input: unknown): WrapperValidation {
  const errors: string[] = [];

  if (!isPlainObject(input)) return { ok: false, errors: ['wrapper must be an object'] };

  const source = input as Record<string, unknown>;
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }

  const id = typeof source.id === 'string' ? source.id.trim() : '';
  if (!id) errors.push('id is required');
  else if (id.length > 80) errors.push('id must be 80 characters or fewer');
  else if (!IDENTIFIER_PATTERN.test(id)) {
    errors.push('id must start with a lowercase letter and use only lowercase letters, numbers, dot, dash, or underscore');
  }

  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!name) errors.push('name is required');
  else if (name.length > 120) errors.push('name must be 120 characters or fewer');

  const description = source.description;
  if (description !== undefined && typeof description !== 'string') errors.push('description must be a string');
  else if (typeof description === 'string' && description.length > 1000) errors.push('description must be 1000 characters or fewer');

  const request = normalizeWrapRequest(source.request, errors);
  const inputSchema = normalizeInputSchema(source.inputSchema, errors);

  let response: Recipe | undefined;
  if (source.response !== undefined) {
    const result = normalizeRecipe(source.response);
    if (result.errors.length > 0) {
      for (const error of result.errors) errors.push(`response.${error}`);
    } else {
      response = result.recipe;
    }
  }

  if (source.lastVerified !== undefined && typeof source.lastVerified !== 'string') {
    errors.push('lastVerified must be a string');
  }
  if (source.notes !== undefined && typeof source.notes !== 'string') errors.push('notes must be a string');

  const mutating = typeof source.mutating === 'boolean' ? source.mutating : undefined;
  const exposeAsTool = typeof source.exposeAsTool === 'boolean' ? source.exposeAsTool : false;

  if (errors.length > 0 || !request) {
    return { ok: false, errors };
  }

  const wrapper: WrapWrapper = {
    schemaVersion: 1,
    id,
    name,
    request,
    inputSchema,
    exposeAsTool,
  };

  if (typeof description === 'string' && description.trim()) wrapper.description = description.trim();
  if (response) wrapper.response = response;
  if (mutating !== undefined) wrapper.mutating = mutating;
  else {
    const methods = request.methods?.length ? request.methods : [request.method];
    wrapper.mutating = methods.some((method) => !['GET', 'HEAD'].includes(method));
  }
  if (typeof source.lastVerified === 'string') wrapper.lastVerified = source.lastVerified;
  if (typeof source.notes === 'string') wrapper.notes = source.notes;

  if (request.methods && request.methods.length > 1) {
    const properties = { ...(inputSchema.properties || {}) };
    const existing = properties.method;
    properties.method = {
      ...(existing && typeof existing === 'object' ? existing : {}),
      type: 'string',
      enum: request.methods,
      description:
        existing?.description ||
        `HTTP method for this call (allowed: ${request.methods.join(', ')}; default: ${request.method}).`,
    };
    inputSchema.properties = properties;
  }

  return { ok: true, wrapper, errors: [] };
}

function normalizeInputSchema(input: unknown, errors: string[]): WrapInputSchema {
  if (input === undefined) return { type: 'object', additionalProperties: true };
  if (!isPlainObject(input)) {
    errors.push('inputSchema must be an object');
    return { type: 'object', additionalProperties: true };
  }

  const source = input as WrapInputSchema;
  if (source.type !== undefined) {
    const types = Array.isArray(source.type) ? source.type : [source.type];
    if (!types.includes('object')) errors.push('inputSchema.type must include "object"');
  }

  if (source.properties !== undefined) {
    if (!isPlainObject(source.properties)) {
      errors.push('inputSchema.properties must be an object');
    } else {
      for (const [key, property] of Object.entries(source.properties)) {
        if (!isPlainObject(property)) errors.push(`inputSchema.properties.${key} must be an object`);
      }
    }
  }

  if (source.items !== undefined && !isPlainObject(source.items)) {
    errors.push('inputSchema.items must be an object');
  }

  if (source.required !== undefined) {
    if (!Array.isArray(source.required) || source.required.some((key) => typeof key !== 'string')) {
      errors.push('inputSchema.required must be an array of strings');
    }
  }

  // When a wrapper declares properties, reject typos by default. A schema-less
  // wrapper stays permissive so a quick GET can still accept arguments.
  const additionalProperties = source.additionalProperties ?? (source.properties ? false : true);
  return { ...source, type: source.type || 'object', additionalProperties };
}

