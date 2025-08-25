const DataSourceModel = RStoreSchema.withItemType<DataSource>().defineModel({
  name: 'DataSource',
  meta: {
    path: 'dataSources',
  },
})

const DataCollectionModel = RStoreSchema.withItemType<DataCollection>().defineModel({
  name: 'DataCollection',
  meta: {
    path: 'dataCollections',
  },
})

const DataFieldModel = RStoreSchema.withItemType<DataField>().defineModel({
  name: 'DataField',
  meta: {
    path: 'dataFields',
  },
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

const DataSourceRelations = RStoreSchema.defineRelations(DataSourceModel, ({ model }) => ({
  collections: {
    many: true,
    to: {
      ...model(DataCollectionModel, {
        on: {
          'DataCollection.dataSourceId': 'DataSource.id',
          // 'DataCollection.id': 'DataSource.id',
        },
        filter: (item, relationItem) => !!item.id && !!relationItem.id,
      }),
    },
  },
}))

const DataCollectionRelations = RStoreSchema.defineRelations(DataCollectionModel, ({ model }) => ({
  source: {
    to: model(DataSourceModel, {
      on: {
        'DataSource.id': 'DataCollection.dataSourceId',
      },
    }),
  },
  fields: {
    many: true,
    to: model(DataFieldModel, {
      on: {
        'DataField.dataCollectionId': 'DataCollection.id',
      },
    }),
  },
}))

const DataFieldRelations = RStoreSchema.defineRelations(DataFieldModel, ({ model }) => ({
  collection: {
    to: model(DataCollectionModel, {
      on: {
        id: 'dataCollectionId',
      },
    }),
  },
}))

export default [
  DataSourceModel,
  DataCollectionModel,
  DataFieldModel,
  DataSourceRelations,
  DataCollectionRelations,
  DataFieldRelations,
]
