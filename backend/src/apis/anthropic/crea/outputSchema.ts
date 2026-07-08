// Literal JSON schema for Crea's structured output (design doc `H`).
// Passed to the Anthropic Messages API via `output_config.format` so the model
// is constrained to return exactly this shape. API constraints: every object
// needs `additionalProperties: false`, and numeric/string bounds are not
// supported (our schema does not use them). Keys are camelCase to map 1:1 onto
// the GraphQL model (`CreaEvaluation`) without a translation layer.

// Taxonomy category keys (design doc `D`, taxonomy_version 1). Append-only.
// `other` is a v1 pragmatic fallback for activities that do not fit a bucket
// (e.g. an unclear contribution that still needs a category slot).
export const CREA_CATEGORY_KEYS = [
  // food_and_agriculture
  'food_production',
  'sustainable_farming',
  'foodsharing_rescue',
  'community_garden',
  'meal_provision',
  // care_and_support
  'elder_care',
  'illness_care',
  'disability_support',
  'emotional_support',
  'emergency_help',
  'social_hardship_support',
  // childcare_and_parenting
  'child_care',
  'parenting',
  'youth_mentoring',
  // nature_and_environment
  'nature_conservation',
  'species_protection',
  'cleanup',
  'reforestation',
  'sustainability_initiative',
  // education_and_knowledge
  'tutoring',
  'workshops_talks',
  'open_resources',
  'education_volunteering',
  // culture_and_community
  'choir_music',
  'theatre_arts',
  'cultural_events',
  'social_movement',
  'common_good_network',
  // civic_and_infrastructure
  'public_space_maintenance',
  'nonprofit_support',
  'neighborhood_help',
  'future_project',
  // fallback
  'other',
] as const

// Stable, append-only rule keys for `appliedRule` (design doc `E`, section
// "Regel-Schluessel"). Auditable / aggregatable across communities.
export const CREA_APPLIED_RULE_KEYS = [
  'confirm_positive_list',
  'confirm_recipient_in_need',
  'confirm_own_children',
  'confirm_child_contributor',
  'confirm_retiree_beyond',
  'confirm_retiree_unconditional',
  'confirm_hours_above',
  'inquire_direct_beneficiary',
  'inquire_own_need',
  'inquire_private_pet',
  'inquire_private_spiritual',
  'inquire_commercial',
  'inquire_unclear',
  'inquire_hours_below',
] as const

const OUTPUT_TYPES = ['material_good', 'service', 'care', 'knowledge', 'stewardship'] as const
const VERDICTS = ['confirm', 'inquire'] as const
const CONFIDENCES = ['low', 'medium', 'high'] as const
const DISCREPANCIES = ['none', 'text_below_entered', 'text_above_entered'] as const

export const CREA_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    beitragRef: { type: 'string' },
    activities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          activity: { type: 'string' },
          categoryKey: { type: 'string', enum: [...CREA_CATEGORY_KEYS] },
          outputType: { type: 'string', enum: [...OUTPUT_TYPES] },
          hours: { type: 'number' },
          hoursEstimated: { type: 'boolean' },
          verdict: { type: 'string', enum: [...VERDICTS] },
          confidence: { type: 'string', enum: [...CONFIDENCES] },
        },
        required: [
          'activity',
          'categoryKey',
          'outputType',
          'hours',
          'hoursEstimated',
          'verdict',
          'confidence',
        ],
      },
    },
    overallVerdict: { type: 'string', enum: [...VERDICTS] },
    discrepancy: { type: 'string', enum: [...DISCREPANCIES] },
    appliedRule: { type: 'string', enum: [...CREA_APPLIED_RULE_KEYS] },
    confidence: { type: 'string', enum: [...CONFIDENCES] },
    reasoning: { type: 'string' },
    responseText: { type: 'string' },
    openPoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          relatesTo: { type: 'string' },
        },
        required: ['question', 'options', 'relatesTo'],
      },
    },
    flags: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'beitragRef',
    'activities',
    'overallVerdict',
    'discrepancy',
    'appliedRule',
    'confidence',
    'reasoning',
    'responseText',
    'openPoints',
    'flags',
  ],
} as const
