import Handlebars from 'handlebars';

/**
 * Get a precompiled template by path
 * @param templatePath - Path like '/templates/result-card-template.html' or '/templates/heritage-asset-public-hb.md'
 * @returns Precompiled Handlebars template function
 */
export function getPrecompiledTemplate(templatePath: string): HandlebarsTemplateDelegate {
    // Extract template name from path: /templates/result-card-template.html -> result-card-template
    const filename = templatePath.split('/').pop();
    if (!filename) {
        throw new Error(`Invalid template path: ${templatePath}`);
    }
    // Remove extension (.html or .md)
    const templateName = filename.replace(/\.(html|md)$/, '');

    const precompiled = (window as any).__PRECOMPILED_TEMPLATES?.[templateName];
    if (!precompiled?.template) {
        throw new Error(`Precompiled template not found: ${templateName} (from path ${templatePath})`);
    }
    return precompiled.template;
}

/**
 * Load template - uses precompiled version if available
 * @param templatePath - Path to the template
 * @param compile - If true, returns compiled template; if false, returns text
 * @returns Precompiled template function or template text
 */
export async function loadTemplate(templatePath: string, compile: boolean = true): Promise<HandlebarsTemplateDelegate | string> {
    if (compile) {
        // Try to use precompiled template first
        try {
            return getPrecompiledTemplate(templatePath);
        } catch (e) {
            console.warn(`Precompiled template not found for ${templatePath}, falling back to runtime compilation`);
        }
    }

    // Fallback: fetch and optionally compile at runtime
    const response = await fetch(templatePath);
    if (!response.ok) {
        throw new Error(`Failed to load template: ${response.statusText}`)
    }
    const templateText = await response.text();

    if (compile) {
        return Handlebars.compile(templateText);
    } else {
        return templateText;
    }
}