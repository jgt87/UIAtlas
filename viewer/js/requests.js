// The viewer's calls to its own server for jobs ("+ New", Export): start one (JSON body or a raw file upload), poll
// it, and the pause between polls. Every request that starts work carries the API header (src/serve.mjs).
import { API_HEADER } from './shared.js';

export const pause = ms => new Promise(r => setTimeout(r, ms));
// -> { status, body }; a body that isn't JSON reads as {}
export const answer = async res => ({ status: res.status, body: await res.json().catch(() => ({})) });

export const postJson = (path, json) => fetch(path, { method: 'POST', headers: { [API_HEADER]: '1', 'Content-Type': 'application/json' }, body: JSON.stringify(json) }).then(answer);
export const postFile = (path, file) => fetch(path, { method: 'POST', headers: { [API_HEADER]: '1' }, body: file }).then(answer);
export const pollJob = id => fetch(`/api/jobs/${id}`).then(r => r.json());
