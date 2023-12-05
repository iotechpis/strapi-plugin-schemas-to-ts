import { SchemaSource } from './schemaSource';

export interface SchemaInfo {
    schema: any;
    schemaName: string;
    pascalName: string;
    needsComponentSuffix: boolean;
    source: SchemaSource;
    interfaceAsText: string;
    plainInterfaceAsText: string;
    enums: string[];
}

const defaultSchemaInfo: SchemaInfo = {
    schema: undefined,
    schemaName: '',
    pascalName: '',
    needsComponentSuffix: false,
    source: SchemaSource.Common,
    interfaceAsText: '',
    plainInterfaceAsText: '',
    enums: [],
};

export default defaultSchemaInfo;
