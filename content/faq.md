+++
date = '2025-07-05T03:36:57-08:00'
draft = false
title = 'Frequently Asked Questions'
+++

The historic environment record is a detailed and nuanced repository
of information, and this viewer attempts to ease the first steps of
exploring it. It is not a full-featured, semantic search engine, but
provides quick lookup functionality for casual users. Here, we answer
some key questions.

## What is the purpose of this viewer?

To make public historic environment information quick and easy to
access on a range of devices for a range of stakeholders, as a gateway
to more powerful research tools.

## What data does this contain?

This viewer contains a slice of [HERoNI](https://www.communities-ni.gov.uk/topics/historic-environment-record-northern-ireland-heroni) data. Much more is available to discover. For a more powerful GIS-driven exploration tool, try the [Historic Environment Map Viewer](https://www.communities-ni.gov.uk/services/historic-environment-map-viewer).

## Why can I not see all entries from all records on the map at once?

This service aims to be quick, robust and as simple as possible. Rather than risking poor performance on older devices, it requires some filtering - by text, by record type and/or by zooming. This ensures we do not load large amounts of data unexpectedly.

Try the [Historic Environment Map Viewer](https://www.communities-ni.gov.uk/services/historic-environment-map-viewer) to do powerful map-based searches.

## Why does this map not use a specific other mapping service?

This service is not used to manage reference records directly, and providing a fully-static, unrestricted service with the types of layers we show would not otherwise be possible. For full official maps and layers, please see the [Historic Environment Map Viewer](https://www.communities-ni.gov.uk/services/historic-environment-map-viewer).

## What technologies does this use?

A number of tools from the [Arches Project](https://www.archesproject.org/) ecosystem are used. The specific, alpha-level platform here is an [AGPL-licensed](https://www.gnu.org/licenses/agpl-3.0.html) tool called **Starches**, which combines [Hugo](https://gohugo.io/), [Pagefind](https://pagefind.app/), [Alizarin](https://github.com/flaxandteal/alizarin/), [Flatgeobuf](https://flatgeobuf.org/) and [OpenFreeMap](https://openfreemap.org/) to create a performant, fully-static map service. As it is static, we can serve large amounts of traffic with simple caching, the possibility of edge-caching and virtually no service-side processing. For technical users who are interested, you can explore each historic asset's data as a self-contained static JSON in Arches' resource format, which is rendered on its viewer page with [Alizarin](https://github.com/flaxandteal/alizarin/) - check your browser's web inspector.

## Can I contribute?

If you are interested in contributing as a volunteer to the underlying data and work of the Historic Environment Division, you can find more information on the [HERoNI](https://www.communities-ni.gov.uk/topics/historic-environment-record-northern-ireland-heroni) site.

If you are a technologist who is interested in collaborating or contributing to the underlying code, please take a look at the projects listed above. We are fortunate to have already had public contributions and are excited to build links with others interested in cultural heritage web services! As with all open source contribution, to ensure your work is ultimately mergeable, please do take note of license requirements in advance and reach out before spending significant time on pull requests to ensure they are aligned with the style, standards and direction of the project.
