targetScope = 'subscription'

param resourceGroupName string
param location string = 'westeurope'
param functionAppName string
param storageAccountName string

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: resourceGroupName
  location: location
}

module app 'resources.bicep' = {
  name: 'app-resources'
  scope: rg
  params: {
    functionAppName: functionAppName
    storageAccountName: storageAccountName
    location: location
  }
}
