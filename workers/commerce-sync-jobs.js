import {runSyncJobs} from '../functions/lib/commerceSyncJobs.js';
export default {async scheduled(_event,env,ctx){ctx.waitUntil(runSyncJobs(env));},async fetch(){return new Response('Not found',{status:404});}};
