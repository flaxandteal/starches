// Starting from git ac5f70e30aa280df6355f55afecaa0bef9fdf8ae of coral-arches
import * as fs from "fs";

import { staticTypes, client, RDM, graphManager, staticStore, viewModels, GraphMutator, setCurrentLanguage } from 'alizarin';

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
for (const haType of ['HeritageAsset', 'HeritageAssetRevision']) {
    const HeritageAsset = await gm.get(haType);
    const rarTypes = await RDM.retrieveCollection('d32d4e92-1d96-fa4a-b14f-594438e7ae30');
    setCurrentLanguage('en');
    const mut = new GraphMutator(HeritageAsset.graph);

    const newGraph = mut
        .addStringNode(
            'component',
            'component_description',
            'Component Description',
            '1',
            'http://www.w3.org/2000/01/rdf-schema#Literal',
            'http://www.cidoc-crm.org/cidoc-crm/P3_has_note'
        )
        .addSemanticNode(
            'record_and_registry_membership',
            'rar_descriptions',
            'Record or Register Descriptions',
            'n',
            'http://www.cidoc-crm.org/cidoc-crm/E33_Linguistic_Object',
            'http://www.cidoc-crm.org/cidoc-crm/P67i_is_referred_to_by',
            "Descriptions specific to this record or registry",
            {
                is_collector: true,
            }
        )
        .addStringNode(
            'rar_descriptions',
            'rar_description',
            'Record or Register Description',
            '1',
            'http://www.w3.org/2000/01/rdf-schema#Literal',
            'http://www.cidoc-crm.org/cidoc-crm/P3_has_note'
        )
        .addConceptNode(
            'rar_descriptions',
            'rar_description_type',
            'Record or Register Description Type',
            '1',
            rarTypes,
            'http://www.cidoc-crm.org/cidoc-crm/E55_Type',
            'http://www.cidoc-crm.org/cidoc-crm/P2_has_type',
            "Type of description specific to this record or register"
        )
        .apply();

    const graphFile = `${haType}.mutated.json`;
    await fs.writeFileSync(
        graphFile,
        JSON.stringify({
            graph: [newGraph]
        }, undefined, 4)
    );
}
