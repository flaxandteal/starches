# {{ title }}

{{#if ha.monument_names }}
{{#each ha.monument_names }}
- {{ monument_name }}
{{/each}}
{{/if }}

{{#if ha.heritage_asset_references.hb_number }}
**HB No.**: {{ ha.heritage_asset_references.hb_number }}
{{/if}}
{{#if ha.heritage_asset_references.smr_number }}
**SMR No.**: {{ ha.heritage_asset_references.smr_number }}
{{/if}}
