import { ChatDecisionModel, UserProfile } from '../lib/conversation/types';
import { extractSectorFromMessage, parseLegalForm } from '../lib/engines/profileExtractor';

console.log("SECTOR per 'bnb':", extractSectorFromMessage("vorrei aprire un bnb in sicilia"));
console.log("SECTOR per 'b&b':", extractSectorFromMessage("vorrei aprire un b&b in sicilia"));
console.log("SECTOR per 'affittacamere':", extractSectorFromMessage("vorrei aprire un affittacamere in sicilia"));
console.log("SECTOR per 'casa vacanze':", extractSectorFromMessage("vorrei aprire una casa vacanze in sicilia"));

