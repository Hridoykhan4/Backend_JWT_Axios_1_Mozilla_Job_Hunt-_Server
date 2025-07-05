/**
 * 1.after successful login: generate a JWT token
 * npm i jsonwebtoken, cookie-parser
 * jwt.sign(user/PAYLOAD, process.env.SECRET_KEY, {expiresIn: '1h'})
 * 
 * 2.send token (generated in the server side) to the client side
 * localStorage-->easier
 * httpOnly cookies--> secure,better
 * 
 * 3.for sensitive or secure or private APIs--send token to the server side
 *
 * 
 *  
 * On the server side
 * app.use(cors({
 *  origin: [`https...`],
 *  credentials: true
 * }))
 * 
 * in the client side
 * use axios get,post,patch,delete for secure APIs and must use: {withCredentials: true}
 * 
 * 4.Validate the token in the server side:
 * if valid provide the data
 * if not valid: logout 
*/

