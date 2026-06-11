import { createClient } from 'contentful';

const space = import.meta.env.VITE_CONTENTFUL_SPACE_ID as string | undefined;
const accessToken = import.meta.env.VITE_CONTENTFUL_DELIVERY_TOKEN as string | undefined;
const environment = (import.meta.env.VITE_CONTENTFUL_ENVIRONMENT as string | undefined) || 'master';

export const hasContentfulConfig = Boolean(space && accessToken);

export const contentfulClient = hasContentfulConfig
  ? createClient({ space: space!, accessToken: accessToken!, environment })
  : null;
