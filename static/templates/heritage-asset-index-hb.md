{{#if ha.monument_names }}
{{#each ha.monument_names }}
- {{ monument_name }}
{{/each}}
{{/if }}

{{#if ha.display_name }}
{{ ha.display_name }}
{{/if }}

{{#if ha.heritage_asset_references.hb_number }}
**HB No.**: {{ ha.heritage_asset_references.hb_number }}
{{/if}}
{{#if ha.heritage_asset_references.smr_number }}
**SMR No.**: {{ ha.heritage_asset_references.smr_number }}
{{/if}}

$$$

{{#each ha.location_data.addresses }}
{{{ replace full_address "_x000D_" "" }}}
{{/each}}
