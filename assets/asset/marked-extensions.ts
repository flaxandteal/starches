import { Token } from 'marked';
import * as params from '@params';
import * as Handlebars from 'handlebars';
import { slugify } from 'alizarin/inline';
import { loadTemplate } from '../shared/handlebar-utils';
import { SectionedHtml } from './markdown-renderer';

// Custom token types
export interface NodeBlockField {
  alias: string;
  label: string;
  value: string;
  slug?: string;
  node?: any;
}

interface NodeBlockToken {
  type: 'nodeBlock';
  raw: string;
  title: string;
  icon?: string;
  body: string;
  fields: NodeBlockField[];
  tokens: Token[];
  initiallyCollapsed: boolean;
  sectionId?: string;
}

interface SectionToken {
  type: 'section';
  raw: string;
  sectionId: string;
  tokens: Token[];
}

export function createSectionExtension(sections: SectionedHtml, getCurrentSectionId: () => string, setCurrentSectionId: (id: string) => void) {
  return {
    name: 'section',
    level: 'block' as const,
    start(src: string) {
      return src.match(/^<!--section:/)?.index;
    },
    tokenizer(this: any, src: string): SectionToken | undefined {
      const match = src.match(/^<!--section:([\w-]+)-->\n?([\s\S]*?)(?=<!--section:|\s*$)/);
      if (match) {
        const sectionId = match[1];
        const content = match[2];

        setCurrentSectionId(sectionId);

        const token: SectionToken = {
          type: 'section',
          raw: match[0],
          sectionId: sectionId,
          tokens: []
        };

        this.lexer.blockTokens(content, token.tokens);
        return token;
      }
    },
    renderer(this: any, token: SectionToken) {
      const innerHtml = this.parser.parse(token.tokens);
      return `<!--section:${token.sectionId}-->${innerHtml}`;
    }
  };
}

export async function createNodeBlockExtension(
  nodes: Map<string, any>,
  getCurrentSectionId: () => string
) {
  const nodeTemplate = await loadTemplate('/templates/asset-nodegroup-template.html', true) as Handlebars.TemplateDelegate;

  return {
    name: 'nodeBlock',
    level: 'block' as const,
    start(src: string) {
      return src.match(/^::/)?.index;
    },
    tokenizer(src: string): NodeBlockToken | undefined {
      const match = src.match(/^::([^:{]+)(?:\{([^}]+)\})?::\n([\s\S]*?)::end::/);
      if (match) {
        const title = match[1].trim();
        const icon = match[2]?.trim();
        let body = match[3].trim();
        const currentSectionId = getCurrentSectionId();
        const id = `${slugify(title)}-${currentSectionId}`;
        let initiallyCollapsed = params.node_config?.collapsednodes?.includes(id);

        // Parse fields - capture multi-line values until next [field] or end
        const fields: NodeBlockField[] = [];
        const fieldPattern = /^\[([^\]]+)\]\s+([\s\S]*?)(?=\n\[|$)/gm;
        let fieldMatch: RegExpExecArray | null;

        while ((fieldMatch = fieldPattern.exec(body)) !== null) {
          const label = fieldMatch[1].trim();
          const value = fieldMatch[2].trim();

          const isNodeRef = label.startsWith('@');
          const alias = isNodeRef ? label.substring(1) : null;
          const node = alias ? nodes.get(alias) : null;

          // Extract data-id from alizarin-resource-instance spans to build slug
          const dataIdMatch = value.match(/data-id=['"]([^'"]+)['"]/);
          const resourceId = dataIdMatch ? dataIdMatch[1] : null;
          const slug = resourceId ? `?slug=${resourceId}` : null

          fields.push({
            alias: alias || '',
            label: isNodeRef ? (node?.name || alias) : label,
            value,
            slug,
            node
          });
        }

        if (!body) {
          body = '<p><strong>No data available</strong></p>';
        }

        const token: NodeBlockToken = {
          type: 'nodeBlock',
          raw: match[0],
          title,
          icon,
          body,
          fields,
          tokens: [],
          initiallyCollapsed,
          sectionId: currentSectionId
        };

        return token;
      }
    },
    renderer(token: any) {
      const nodeToken = token as NodeBlockToken;
      const titleId = slugify(nodeToken.title);
      const sectionId = nodeToken.sectionId || 'default';
      const id = `${titleId}-${sectionId}`;

      return nodeTemplate({
        title: nodeToken.title,
        icon: nodeToken.icon,
        fields: nodeToken.fields,
        body: nodeToken.body,
        id: id,
        initiallyExpanded: !nodeToken.initiallyCollapsed,
        sectionId: sectionId
      });
    }
  };
}
