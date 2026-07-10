import gql from 'graphql-tag'

// Rewrite only the reply text when the moderator deviates from Crea's recommendation
// (E-017). Returns just the new text (String) — no re-evaluation, no persistence.
export const creaRewriteResponse = gql`
  mutation ($input: CreaContributionInput!) {
    creaRewriteResponse(input: $input)
  }
`
