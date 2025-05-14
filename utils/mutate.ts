import * as fs from "fs";

import { staticTypes, client, RDM, graphManager, staticStore, viewModels, GraphMutator } from 'alizarin';

import { assetFunctions } from '../prebuild/functions.ts';

await assetFunctions.initialize();
const MODEL_FILES = assetFunctions.getModelFiles();
viewModels.CUSTOM_DATATYPES.set("tm65centrepoint", "non-localized-string");

function initAlizarin() {
    const archesClient = new client.ArchesClientLocal({
        allGraphFile: (() => "prebuild/graphs.json"),
        graphIdToGraphFile: ((graphId: string) => MODEL_FILES[graphId] && `prebuild/graphs/resource_models/${MODEL_FILES[graphId].graph}`),
        graphToGraphFile: ((graph: staticTypes.StaticGraphMeta) => (graph.name && `prebuild/graphs/resource_models/${graph.name}.json`) || ''),
        collectionIdToFile: ((collectionId: string) => `prebuild/reference_data/collections/${collectionId}.json`)
    });
    archesClient.fs = fs;
    graphManager.archesClient = archesClient;
    staticStore.archesClient = archesClient;
    staticStore.cacheMetadataOnly = false;
    RDM.archesClient = archesClient;
    return graphManager;
}

const gm = await initAlizarin();
await gm.initialize();
const HeritageAsset = await gm.get('HeritageAsset');
const mut = new GraphMutator(HeritageAsset.graph);

const newGraph = mut.addStringNode(
    'component',
    'component_description',
    'Component Description',
    '1',
    'http://www.w3.org/2000/01/rdf-schema#Literal',
    'http://www.cidoc-crm.org/cidoc-crm/P3_has_note'
).apply();

const graphFile = 'Heritage Asset.mutated.json';
await fs.writeFileSync(
    graphFile,
    JSON.stringify(newGraph, undefined, 2)
);
