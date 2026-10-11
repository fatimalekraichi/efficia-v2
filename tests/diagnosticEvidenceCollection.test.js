import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFreeDiagnosticCollectionState} from '../functions/lib/freeDiagnosticProductionLink.js';
test('business.competitors conserve le rang et la comparabilité, sans en inventer dans les anciennes données',()=>{
 const business={name:'Entreprise test',placeId:'place-test',normalized:{competitor_qualification_version:1},competitors:[{name:'A',rank:3,positionKind:'organic',comparable:true,rankEvidence:{source:'provider_result_index_zero_based'}}]};
 const state=buildFreeDiagnosticCollectionState({business,scoringVersion:'score-efficia-v5'});
 assert.equal(state.business.competitors[0].rank,3);assert.equal(state.business.competitors[0].comparable,true);
 business.competitors=[{name:'Ancien'}];
 const old=buildFreeDiagnosticCollectionState({business,scoringVersion:'score-efficia-v5'});
 assert.equal(old.business.competitors[0].rank,null);assert.equal(old.business.competitors[0].comparable,null);
});
