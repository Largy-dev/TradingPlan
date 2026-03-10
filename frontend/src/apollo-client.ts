import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';

// In Docker: Nginx proxies /graphql to the backend — no hardcoded host needed.
// In dev: Vite proxy or direct localhost:4000.
const httpUri =
  import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/graphql`
    : '/graphql';

const wsUri =
  import.meta.env.VITE_WS_URL
    ? `${import.meta.env.VITE_WS_URL}/graphql`
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/graphql`;

const httpLink = new HttpLink({ uri: httpUri });

const wsLink = new GraphQLWsLink(createClient({ url: wsUri }));

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  httpLink,
);

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
