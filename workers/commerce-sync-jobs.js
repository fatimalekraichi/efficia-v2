import {runCommerceJobs} from '../functions/lib/commerceReminders.js';
export default {async scheduled(_event,env,ctx){ctx.waitUntil(runCommerceJobs(env));},async fetch(){return new Response('Not found',{status:404});}};
