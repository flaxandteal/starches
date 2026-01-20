import { StyleDictionary, TDocumentDefinitions } from "pdfmake/interfaces";

function formatNodeLabel(keyString: string, nodes: Map<string, any>): string {
    const isNodeAlias = keyString.startsWith('@');
    const alias = isNodeAlias ? keyString.substring(1) : null;
    const resolvedNode = alias ? nodes.get(alias) : null;
    const nodeLabel = resolvedNode && typeof resolvedNode.name === 'string' ? resolvedNode.name : keyString;

    return nodeLabel;
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&rsquo;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

interface RichTextContent {
    text: string | any[];
    bold?: boolean;
    italics?: boolean;
    decoration?: string;
    link?: string;
    color?: string;
    style?: string;
    margin?: number[];
    fontSize?: number;
}

// Convert HTML to pdfmake rich text object, preserving basic styling
function htmlToRichText(html: string): RichTextContent {
    const result: any[] = [];
    const remaining = html.trim();

    // Pattern to match HTML tags and their content
    const tagPattern = /<(strong|b|em|i|u|a|span|br|time|p|h1|h2|h3)([^>]*)>([\s\S]*?)<\/\1>|<(br)\s*\/?>|([^<]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = tagPattern.exec(remaining)) !== null) {
        const [, tagName, attrs, innerContent, selfClosingTag, plainText] = match;

        if (selfClosingTag === 'br') {
            result.push({ text: '\n' });
        } else if (plainText) {
            const decoded = decodeHtmlEntities(plainText.trim());
            if (decoded) {
                result.push({ text: decoded });
            }
        } else if (tagName) {
            const tag = tagName.toLowerCase();
            const content = decodeHtmlEntities(innerContent.replace(/<[^>]*>/g, '').trim());

            if (!content) continue;

            switch (tag) {
                case 'strong':
                case 'b':
                    result.push({ text: content, bold: true });
                    break;
                case 'em':
                case 'i':
                    result.push({ text: content, italics: true });
                    break;
                case 'u':
                    result.push({ text: content, decoration: 'underline' });
                    break;
                case 'a':
                    const hrefMatch = attrs.match(/href=["']([^"']+)["']/);
                    if (hrefMatch) {
                        result.push({ text: content, link: hrefMatch[1], color: '#1976d2', decoration: 'underline' });
                    } else {
                        result.push({ text: content });
                    }
                    break;
                case 'time':
                    // Format date if it's a time element
                    const datetimeMatch = attrs.match(/datetime=["']([^"']+)["']/);
                    if (datetimeMatch) {
                        try {
                            const date = new Date(datetimeMatch[1]);
                            result.push({ text: date.toLocaleDateString() });
                        } catch {
                            result.push({ text: content });
                        }
                    } else {
                        result.push({ text: content });
                    }
                    break;
                case 'p':
                    result.push({ text: content + '\n' });
                    break;
                case 'h1':
                    result.push({ text: '\n' +content + '\n' , fontSize: 18, bold: true });
                    break;
                case 'h2':
                    result.push({ text: '\n' + content + '\n', fontSize: 16, bold: true });
                    break;
                case 'h3':
                    result.push({ text: '\n' + content + '\n', fontSize: 14, bold: true });
                    break;
                default:
                    result.push({ text: content });
            }
        }
    }

    // If no HTML was found, return plain text
    if (result.length === 0) {
        const plainText = decodeHtmlEntities(html.replace(/<[^>]*>/g, '').trim());
        return { text: plainText || '' };
    }

    return { text: result };
}

export function markdownToPdf(markdown: string, nodes: Map<string, any>, title: string): TDocumentDefinitions {
    const content: any[] = [];
    const seenSections = new Set<string>();

    // Document title
    content.push({ text: title, style: 'documentTitle' });

    // Match nodeBlocks: ::Title{icon}::\n...content...\n::end::
    const nodeBlockPattern = /^::([^:{]*)(?:\{([^}]+)\})?::\n([\s\S]*?)::end::/gm;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = nodeBlockPattern.exec(markdown)) !== null) {
        const sectionTitle = blockMatch[1].trim();

        // Skip duplicate sections (only for titled sections)
        if (sectionTitle && seenSections.has(sectionTitle)) {
            continue;
        }
        if (sectionTitle) {
            seenSections.add(sectionTitle);
        }

        const body = blockMatch[3].trim();

        // Parse fields from the body - handle multi-line values
        const fields: { label: string; value: RichTextContent }[] = [];
        const plainTextParts: RichTextContent[] = [];
        const fieldPattern = /\[([^\]]+)\]\s+([\s\S]*?)(?=\n\[|$)/g;
        let fieldMatch: RegExpExecArray | null;
        let lastIndex = 0;

        while ((fieldMatch = fieldPattern.exec(body)) !== null) {
            // Capture any plain text before this field
            const textBefore = body.slice(lastIndex, fieldMatch.index).trim();
            if (textBefore) {
                const richText = htmlToRichText(textBefore);
                if (richText) {
                    plainTextParts.push(richText);
                }
            }
            lastIndex = fieldMatch.index + fieldMatch[0].length;

            const label = fieldMatch[1].trim();
            const rawValue = fieldMatch[2].trim();
            // Convert HTML to rich text for PDF output
            const value = htmlToRichText(rawValue);

            if (value) {
                fields.push({
                    label: formatNodeLabel(label, nodes),
                    value
                });
            }
        }

        // Capture any remaining text after the last field
        const remainingText = body.slice(lastIndex).trim();
        if (remainingText) {
            const richText = htmlToRichText(remainingText);
            if (richText) {
                plainTextParts.push(richText);
            }
        }

        // If no fields found, treat entire body as plain text
        if (fields.length === 0 && plainTextParts.length === 0) {
            const richBody = htmlToRichText(body);
            if (richBody) {
                plainTextParts.push(richBody);
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
                margin: [0, 15, 0, 0]
            });

            // Plain text content (without labels)
            for (const text of plainTextParts) {
                content.push({
                    ...text,
                    style: 'fieldValue',
                    margin: [12, 8, 12, 0]
                });
            }

            // Section content (fields with labels)
            for (const field of fields) {
                content.push({
                    columns: [
                        { text: field.label + ':', width: 140, style: 'fieldLabel' },
                        { ...field.value, style: 'fieldValue' }
                    ],
                    margin: [12, 8, 12, 0]
                });
            }
        }
    }

    const styles: StyleDictionary = {
        documentTitle: {
            fontSize: 20,
            bold: true,
            color: '#1a1a1a',
            margin: [0, 0, 0, 10]
        },
        sectionHeader: {
            fontSize: 14,
            bold: true,
            color: '#1976d2'
        },
        fieldLabel: {
            bold: true,
            fontSize: 11,
            color: '#333333'
        },
        fieldValue: {
            fontSize: 11,
            color: '#666666'
        }
    };

    return { content, styles };
}

