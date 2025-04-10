export default [
  defineItemType<DataSource>().model({
    name: 'DataSource',
    relations: {
      collections: {
        many: true,
        to: {
          DataCollection: {
            on: 'dataSourceId',
            eq: 'id',
          },
        },
      },
    },
    meta: {
      path: 'dataSources',
    },
  }),
  defineItemType<DataCollection>().model({
    name: 'DataCollection',
    relations: {
      source: {
        to: {
          DataSource: {
            on: 'id',
            eq: 'dataSourceId',
          },
        },
      },
      fields: {
        many: true,
        to: {
          DataField: {
            on: 'dataCollectionId',
            eq: 'id',
          },
        },
      },
    },
    meta: {
      path: 'dataCollections',
    },
  }),
  defineItemType<DataField>().model({
    name: 'DataField',
    relations: {
      collection: {
        to: {
          DataCollection: {
            on: 'id',
            eq: 'dataCollectionId',
          },
        },
      },
    },
    meta: {
      path: 'dataFields',
    },
  }),
]
