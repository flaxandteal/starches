if (!['0', '1'].includes(process.env["STARCHES_INCLUDE_PRIVATE"] || '')) {
    throw Error("STARCHES_INCLUDE_PRIVATE env must be set to '0' or '1'")
}

function slugify(name: string) {
    return `${name}`.replaceAll(/[^A-Za-z0-9_]/g, "").slice(0, 20);
}

const NON_PUBLIC: boolean = process.env["STARCHES_INCLUDE_PRIVATE"] == "1";
export { NON_PUBLIC, slugify };
