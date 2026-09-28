import XCTest
import SwiftUI
import Combine
@testable import BaggerInv

private actor AuditCache: ReadCacheStoring {
 var items:[String:Data]=[:]
 func read(product:MobileReadProduct,partition:ReadCachePartition)->Data? {items[product.rawValue]}
 func write(_ data:Data,product:MobileReadProduct,partition:ReadCachePartition){items[product.rawValue]=data}
 func remove(product:MobileReadProduct,partition:ReadCachePartition){items.removeValue(forKey:product.rawValue)}
 func remove(partition:ReadCachePartition){items.removeAll()}
 func byteCount(partition:ReadCachePartition)->Int{items.values.reduce(0){$0+$1.count}}
}
@MainActor private final class AuditCredentials:MobileReadCredentialProviding {
 func credentials(expectedAuthUserID:String) async throws ->MobileReadCredentials{.init(authUserID:expectedAuthUserID,accessToken:"isolated-audit",certification:"isolated-audit")}
}
final class TodayFallbackAuditTests:XCTestCase {
 @MainActor func settle(_ seconds:Double=0.25) async {try? await Task.sleep(nanoseconds:UInt64(seconds*1_000_000_000))}
 @MainActor func tabs(_ controller:UIViewController)->UITabBarController? {
  if let c=controller as? UITabBarController{return c}
  for child in controller.children {if let c=tabs(child){return c}}
  return nil
 }
 @MainActor func testActualShippingRootRecreation() async throws {
  let api=MockMobileAPI(), auth=MockAuthService(),store=MockCertificationStore(),life=MockTournamentDataLifecycle()
  auth.restoredSessionValue=TestFixtures.authSession
  store.credentialValue = .init(token:TestFixtures.certificationToken,userID:TestFixtures.authSession.userID,expiresAt:TestFixtures.now.addingTimeInterval(3600))
  let data=TournamentDataCoordinator(api:api,credentialProvider:AuditCredentials(),cache:AuditCache(),applicationActivity:NativeApplicationActivity(isActive:false),now:{TestFixtures.now})
  let c=AppCoordinator(environment:TestFixtures.environment,api:api,auth:auth,certificationStore:store,tournamentDataLifecycle:life,tournamentData:data,now:{TestFixtures.now})
  c.handleApplicationSceneChange(isActive:true);await c.bootstrap()
  let scene=try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
  let window=UIWindow(windowScene:scene);window.frame=scene.coordinateSpace.bounds
  let host=UIHostingController(rootView:RootView(coordinator:c));window.rootViewController=host;window.makeKeyAndVisible();await settle(0.7)
  var rows:[[String:Any]]=[]
  for (index,name) in [(1,"Matches"),(2,"Score"),(3,"Leaders"),(4,"More")] {
   let before=try XCTUnwrap(tabs(host));before.selectedIndex=index
   before.delegate?.tabBarController?(before,didSelect:before.viewControllers![index]);await settle()
   XCTAssertEqual(before.selectedIndex,index)
   let beforeID=ObjectIdentifier(before)
   api.suspendNextHealth();let revalidation = Task { await c.revalidateReadAuthorityAfterUnavailableResponse() };await settle()
   XCTAssertEqual(c.state,.checkingEnvironment);XCTAssertNil(tabs(host))
   api.resumeSuspendedHealth();await revalidation.value;await settle(0.5)
   let after=try XCTUnwrap(tabs(host));XCTAssertEqual(c.state,.authenticated(TestFixtures.participant));XCTAssertEqual(after.selectedIndex,0);XCTAssertNotEqual(beforeID,ObjectIdentifier(after));XCTAssertEqual(auth.signOutCallCount,0)
   rows.append(["destination":name,"checkingEnvironmentRemovesShell":true,"newShell":true,"afterSelectedIndex":after.selectedIndex,"signOuts":auth.signOutCallCount])
   if name=="Leaders" {
    let renderer=UIGraphicsImageRenderer(bounds:window.bounds)
    let png=renderer.image{_ in window.drawHierarchy(in:window.bounds,afterScreenUpdates:true)}.pngData()!
    let a=XCTAttachment(data:png,uniformTypeIdentifier:"public.png");a.name="Actual-Build10-after-feature-revalidation-Today";a.lifetime = .keepAlways;add(a)
   }
  }
  let a=XCTAttachment(string:String(data:try JSONSerialization.data(withJSONObject:rows,options:[.prettyPrinted]),encoding:.utf8)!);a.name="Actual shipping root navigation evidence";a.lifetime = .keepAlways;add(a)
  print("AUDIT_ACTUAL_SWIFTUI",rows)
  window.isHidden=true
 }
 @MainActor func testShippingBackgroundForegroundPreservesTabUntilGlobalFailure() async throws {
  let api=MockMobileAPI(),auth=MockAuthService(),store=MockCertificationStore(),life=MockTournamentDataLifecycle()
  auth.restoredSessionValue=TestFixtures.authSession
  store.credentialValue = .init(token:TestFixtures.certificationToken,userID:TestFixtures.authSession.userID,expiresAt:TestFixtures.now.addingTimeInterval(3600))
  let data=TournamentDataCoordinator(api:api,credentialProvider:AuditCredentials(),cache:AuditCache(),applicationActivity:NativeApplicationActivity(isActive:false),now:{TestFixtures.now})
  let c=AppCoordinator(environment:TestFixtures.environment,api:api,auth:auth,certificationStore:store,tournamentDataLifecycle:life,tournamentData:data,now:{TestFixtures.now})
  c.handleApplicationSceneChange(isActive:true);await c.bootstrap()
  let scene=try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
  let window=UIWindow(windowScene:scene);window.frame=scene.coordinateSpace.bounds
  let host=UIHostingController(rootView:RootView(coordinator:c));window.rootViewController=host;window.makeKeyAndVisible();await settle(0.5)
  for index in 0...4 {
   let before=try XCTUnwrap(tabs(host));before.selectedIndex=index
   before.delegate?.tabBarController?(before,didSelect:before.viewControllers![index]);await settle()
   for error in [nil,MobileAPIClientError.transportUnavailable,MobileAPIClientError.invalidHTTPResponse] {
    api.healthError=error;await c.pauseTournamentDataForBackground();await c.refreshTournamentDataForForeground();await settle()
    XCTAssertEqual(c.state,.authenticated(TestFixtures.participant));let after=try XCTUnwrap(tabs(host));XCTAssertTrue(before===after);XCTAssertEqual(after.selectedIndex,index)
   }
   api.healthError=nil
  }
  print("AUDIT_FOREGROUND: all five actual tab shells preserve selection/identity for healthy, timeout/offline-normalized transport, and invalidHTTPResponse health failures")
  window.isHidden=true
 }
 @MainActor func testAllHTTPAndTransportClassesThroughShippingRepository() async throws {
  let cases:[(String,any Error,Bool,Bool)]=[400,401,403,404,409,410,422,429,500,502,503,504].map{("bareHTTP\($0)",MobileAPIClientError.unexpectedStatus($0),false,[401,403].contains($0))}+[
    ("feature503",MobileAPIClientError.server(code:.mobileAPIUnavailable,status:503),true,false),
    ("feature409WithGlobalCode",MobileAPIClientError.server(code:.mobileAPIUnavailable,status:409),true,false),
    ("semantic200",MobileContractError.incompatibleResponse,false,false),
    ("timeout",URLError(.timedOut),false,false),("offline",URLError(.notConnectedToInternet),false,false),("interruption",URLError(.networkConnectionLost),false,false)]
  var rows:[[String:Any]]=[]
  for (name,error,expectedAuthority,expectedAccess) in cases {
   var authorities=0,accesses=0
   let repo=MobileReadRepository<MobileNetSkinsResponse>(product:.netSkins,cache:AuditCache(),credentialProvider:AuditCredentials()){_,_ in throw error}
   repo.setAuthorityRevalidationHandler{authorities += 1};repo.setAccessInvalidationHandler{accesses += 1}
   let context=ActiveMobileReadContext(cachePartition:try ReadCachePartition(environment:"AUDIT",authUserID:"isolated",playerID:"CB01",tournamentID:"2026"),authUserID:"isolated",playerID:"CB01",tournamentID:"2026")
   await repo.activate(context,beginRefresh:false);await repo.refresh()
   XCTAssertEqual(authorities>0,expectedAuthority,name);XCTAssertEqual(accesses>0,expectedAccess,name)
   rows.append(["case":name,"failure":String(describing:repo.state.lastSafeError),"authorityRevalidations":authorities,"accessInvalidations":accesses])
  }
  print("AUDIT_ERROR_MATRIX",rows)
 }
}
