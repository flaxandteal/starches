# Starches [alpha]

Static-site for running directly from Arches JSON data. Uses [alizarin](https://github.com/flaxandteal/alizarin/).

### Quickstart

Steps:

1. Populate `static/definitions/business_data`, `static/definitions/collections` and `static/definitions/reference_data` directories
2. Check the `MODEL_FILES` are right in `utils/reindex.js`
3. Run `npm install`
4. Run `npm run reindex`
5. Run `hugo serve`

### Notes

Any collection or model changes will need copied from prebuild/reference_data and prebuild/resource_models(?) to /static/definitions/collections etc. manually.

### License

Currently, and you should assume for the foreseeable future,
any use of this package, even as a front-end library, carries AGPL requirements and that
means any derived work must be licensed appropriately, with shared source-code. This, for
avoidance of doubt, means original untranspiled Javascript, Typescript etc. must be made
public to all web-users for the whole of any web platform using this library.

**This library unlikely to be suitable for use in most traditional commercial products.**

We may, in future, dual-license or relicense this package more liberally, so please note
that we will expect **any PRs to be MIT-licensed** to enable the possibility.
This may seem lopsided if we begin receiving PRs on the scale of the existing project,
so if you are considering doing a
substantial piece of work, get in touch beforehand to see if a relicense is possible (which
may depend on third-party discussions) and how we can handle it.

**Please note** that there is third-party code in the `tests/` subdirectory.

### Acknowledgments

Thanks to the folks at [Historic England](https://historicengland.org.uk/), the
[GCI](https://www.getty.edu/conservation/) and the [Arches Developer Community](https://www.archesproject.org/)
for the fantastic Arches project, and to the
[Historic Environment Division](https://www.communities-ni.gov.uk/topics/historic-environment) for their
support of our related Arches work.

In particular, the test data is based on the resource models from [Arches for HERs](https://www.archesproject.org/arches-for-hers/)
and [Arches for Science](https://www.archesproject.org/arches-for-science/).
