import gql from 'graphql-tag'

export const setCreaSalutation = gql`
  mutation ($userId: Int!, $salutation: String) {
    setCreaSalutation(userId: $userId, salutation: $salutation)
  }
`
