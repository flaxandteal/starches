import { StyleDictionary, TDocumentDefinitions } from "pdfmake/interfaces";
import htmlToPdfmake from "html-to-pdfmake";

export interface PdfImage {
    dataUrl: string;
    alt: string;
    name: string;
}

function formatNodeLabel(keyString: string, nodes: Map<string, any>): string {
    const isNodeAlias = keyString.startsWith('@');
    const alias = isNodeAlias ? keyString.substring(1) : null;
    const resolvedNode = alias ? nodes.get(alias) : null;
    return resolvedNode && typeof resolvedNode.name === 'string' ? resolvedNode.name : keyString;
}

// Column count for grouped fields (fields with repeated labels).
// Labels not listed here default to a single stacked column.
const groupedFieldColumns: Record<string, number> = {
    'Lot on Plan': 3,
};

// Default styles matching the page design, adjust these for any HTML elements in the content
const defaultStyles = {
    b: { bold: true },
    strong: { bold: true },
    i: { italics: true },
    em: { italics: true },
    u: { decoration: 'underline' as const },
    a: { color: '#1976d2', decoration: 'underline' as const },
    p: { fontSize: 11, color: '#444444', margin: [12, 0, 0, 0] as [number, number, number, number] },
    h1: { fontSize: 18, color: '#19315a', margin: [12, 6, 0, 4] as [number, number, number, number] },
    h2: { fontSize: 16, color: '#19315a', margin: [12, 5, 0, 3] as [number, number, number, number] },
    h3: { fontSize: 14, color: '#19315a', margin: [12, 4, 0, 2] as [number, number, number, number] },
    h4: { fontSize: 12, color: '#19315a', margin: [12, 3, 0, 2] as [number, number, number, number] },
    ul: { fontSize: 11, color: '#444444', margin: [24, 2, 0, 0] as [number, number, number, number] },
    ol: { fontSize: 11, color: '#444444', margin: [24, 2, 0, 0] as [number, number, number, number] },
    li: { fontSize: 11, color: '#444444' },
};

// Convert HTML to pdfmake content
function htmlToContent(html: string): any {
    if (!html.trim()) return [];
    return htmlToPdfmake(html, { defaultStyles });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = (err) => {
            reject(err);
        };
        img.src = dataUrl;
    });
}

export async function markdownToPdf(markdown: string, nodes: Map<string, any>, title: string, images?: PdfImage[]): Promise<TDocumentDefinitions> {
    const content: any[] = [];
    const seenSections = new Set<string>();

    // Document title
    content.push({ text: title, style: 'documentTitle' });

    // Match nodeBlocks: ::Title{icon}::\n...content...\n::end::
    const nodeBlockPattern = /^::([^:{]*)(?:\{([^}]+)\})?::\n([\s\S]*?)::end::/gm;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = nodeBlockPattern.exec(markdown)) !== null) {
        const sectionTitle = blockMatch[1].trim();

        // Skip duplicate sections
        if (sectionTitle && seenSections.has(sectionTitle)) continue;
        if (sectionTitle) seenSections.add(sectionTitle);

        const body = blockMatch[3].trim();

        // Parse fields: [Label] value (only at start of line)
        const fields: { label: string; value: any }[] = [];
        const plainTextParts: any[] = [];
        const fieldPattern = /(?:^|\n)\[([^\]]+)\]\s+([\s\S]*?)(?=\n\[|$)/g;
        let fieldMatch: RegExpExecArray | null;
        let lastIndex = 0;

        while ((fieldMatch = fieldPattern.exec(body)) !== null) {
            // Capture plain text before this field
            const textBefore = body.slice(lastIndex, fieldMatch.index).trim();
            if (textBefore) {
                const converted = htmlToContent(textBefore);
                if (Array.isArray(converted)) {
                    plainTextParts.push(...converted);
                } else if (converted) {
                    plainTextParts.push(converted);
                }
            }
            lastIndex = fieldMatch.index + fieldMatch[0].length;

            const label = fieldMatch[1].trim();
            const rawValue = fieldMatch[2].trim();
            const value = htmlToContent(rawValue);

            if (rawValue && (!Array.isArray(value) || value.length > 0)) {
                fields.push({
                    label: formatNodeLabel(label, nodes),
                    value: Array.isArray(value) ? { stack: value } : value
                });
            }
        }

        // Capture remaining text after last field
        const remainingText = body.slice(lastIndex).trim();
        if (remainingText) {
            const converted = htmlToContent(remainingText);
            if (Array.isArray(converted)) {
                plainTextParts.push(...converted);
            } else if (converted) {
                plainTextParts.push(converted);
            }
        }

        // If no fields found, treat entire body as content
        if (fields.length === 0 && plainTextParts.length === 0) {
            const converted = htmlToContent(body);
            if (Array.isArray(converted)) {
                plainTextParts.push(...converted);
            } else if (converted) {
                plainTextParts.push(converted);
            }
        }

        // Only add section if it has content
        if (fields.length > 0 || plainTextParts.length > 0) {
            // Section header
            content.push({
                table: {
                    widths: ['*'],
                    body: [[{ text: sectionTitle, style: 'sectionHeader', fillColor: '#f5f5f5' }]]
                },
                layout: {
                    hLineWidth: (i: number, node: any) => (i === node.table.body.length) ? 1 : 0,
                    vLineWidth: () => 0,
                    hLineColor: () => '#dddddd',
                    paddingTop: () => 10,
                    paddingBottom: () => 10,
                    paddingLeft: () => 12,
                    paddingRight: () => 12
                },
                margin: [0, 15, 0, 10]
            });

            // Section content (no labels)
            for (const item of plainTextParts) {
                content.push(item);
            }

            // Group consecutive fields with the same label
            const groupedFields: { label: string; values: any[] }[] = [];
            for (const field of fields) {
                const last = groupedFields[groupedFields.length - 1];
                if (last && last.label === field.label) {
                    last.values.push(field.value);
                } else {
                    groupedFields.push({ label: field.label, values: [field.value] });
                }
            }

            // Field content (label: value pairs)
            for (const group of groupedFields) {
                if (group.values.length > 1 && group.label in groupedFieldColumns) {
                    // Multi-value group: one label, values in columns
                    const cols = groupedFieldColumns[group.label];
                    const rows: any[][] = [];
                    for (let i = 0; i < group.values.length; i += cols) {
                        const row = [];
                        for (let j = 0; j < cols; j++) {
                            const val = group.values[i + j];
                            row.push(val ? { ...val, style: 'fieldValue' } : { text: '' });
                        }
                        rows.push(row);
                    }
                    content.push({
                        columns: [
                            { text: group.label + ':', width: 140, style: 'fieldLabel' },
                            {
                                table: {
                                    widths: Array(cols).fill('*'),
                                    body: rows
                                },
                                layout: 'noBorders'
                            }
                        ],
                        margin: [12, 8, 12, 0]
                    });
                } else {
                    for (const val of group.values) {
                        content.push({
                            columns: [
                                { text: group.label + ':', width: 140, style: 'fieldLabel' },
                                { ...val, style: 'fieldValue' }
                            ],
                            margin: [12, 8, 12, 0]
                        });
                    }
                }
            }
        }
    }

    // Image sections at the end of the document
    if (images && images.length > 0) {
        const illustrations = images.filter(img => !img.name.toLowerCase().includes('map'));
        const boundaryMaps = images.filter(img => img.name.toLowerCase().includes('map'));

        for (const { heading, items } of [
            { heading: 'Illustrations', items: illustrations },
            { heading: 'Boundary Maps', items: boundaryMaps }
        ]) {
            if (items.length === 0) continue;

            content.push({
                text: heading,
                style: 'sectionHeader',
                pageBreak: 'before' as const,
                margin: [0, 0, 0, 10]
            });

            for (const img of items) {
                const {width, height} = await getImageDimensions(img.dataUrl);
                const isLandscape = width >= height;
                const sizing = isLandscape ? { width: 400 } : { height: 500 };
                content.push({
                    image: img.dataUrl,
                    ...sizing,
                    alignment: 'center' as const,
                    margin: [0, 5, 0, 2]
                });
                content.push({
                    text: img.alt,
                    style: 'imageCaption',
                    alignment: 'center' as const,
                    margin: [0, 0, 0, 15]
                });
            }
        }
    }

    const styles: StyleDictionary = {
        documentTitle: {
            fontSize: 18,
            bold: true,
            color: '#19315a',
            margin: [0, 0, 0, 8]
        },
        sectionHeader: {
            fontSize: 14,
            bold: true,
            color: '#19315a'
        },
        fieldLabel: {
            bold: true,
            fontSize: 11,
            color: '#333333'
        },
        fieldValue: {
            fontSize: 11,
            color: '#444444'
        },
        imageCaption: {
            fontSize: 10,
            italics: true,
            color: '#666666'
        }
    };

    return { content, styles };
}
