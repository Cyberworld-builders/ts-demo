import { createConnection, Connection } from 'typeorm';
import { developmentConfig, testConfig } from './database';

let connection: Connection | null = null;

export const initializeDatabase = async (isTest = false): Promise<Connection> => {
  if (connection) {
    return connection;
  }
  
  const config = isTest ? testConfig : developmentConfig;
  connection = await createConnection(config);
  return connection;
};

export const closeConnection = async (): Promise<void> => {
  if (connection) {
    await connection.close();
    connection = null;
  }
}; 