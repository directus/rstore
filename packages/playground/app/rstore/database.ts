import { z } from 'zod'

const DataSourceCollection = RStoreSchema.withItemType<DataSource>().defineCollection({
  name: 'DataSource',
  meta: {
    path: 'dataSources',
  },
})

const DataCollectionCollection = RStoreSchema.withItemType<DataCollection>().defineCollection({
  name: 'DataCollection',
  meta: {
    path: 'dataCollections',
  },
})

const DataFieldCollection = RStoreSchema.withItemType<DataField>().defineCollection({
  name: 'DataField',
  meta: {
    path: 'dataFields',
    // meow: true,
  },
  // meow: true,
  getKey: item => item.id,
  // isInstanceOf: _item => true,
  computed: {
    foo: item => `Field: ${item.name}`,
  },
  fields: {
    name: {
      parse: (value: any) => String(value).toUpperCase(),
      serialize: (value: string) => value.toLowerCase(),
    },
    // meow: 'meow',
  },
  formSchema: {
    create: z.object({}),
    update: z.object({}),
  },
  // scopeId: 'datasource-1',
  // relations: {
  //   collection: {
  //     to: {
  //       DataCollection: {
  //         on: {
  //           id: 'dataCollectionId',
  //         },
  //         filter: (item, relationItem) => item.id === relationItem.dataCollectionId,
  //       }
  //     },
  //   },
  // }
})

const DataSourceRelations = RStoreSchema.defineRelations(DataSourceCollection, ({ collection }) => ({
  collections: {
    many: true,
    to: {
      ...collection(DataCollectionCollection, {
        on: {
          'DataCollection.dataSourceId': 'DataSource.id',
          // 'DataCollection.id': 'DataSource.id',
        },
        filter: (item, relationItem) => !!item.id && !!relationItem.id,
      }),
    },
  },
}))

const DataCollectionRelations = RStoreSchema.defineRelations(DataCollectionCollection, ({ collection }) => ({
  source: {
    to: collection(DataSourceCollection, {
      on: {
        'DataSource.id': 'DataCollection.dataSourceId',
      },
    }),
  },
  fields: {
    many: true,
    to: collection(DataFieldCollection, {
      on: {
        'DataField.dataCollectionId': 'DataCollection.id',
      },
    }),
  },
}))

const DataFieldRelations = RStoreSchema.defineRelations(DataFieldCollection, ({ collection }) => ({
  collection: {
    to: collection(DataCollectionCollection, {
      on: {
        id: 'dataCollectionId',
      },
    }),
  },
}))

export default [
  DataSourceCollection,
  DataCollectionCollection,
  DataFieldCollection,
  DataSourceRelations,
  DataCollectionRelations,
  DataFieldRelations,
]
