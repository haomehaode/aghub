use aghub_api::{start, ApiOptions};

#[tokio::main]
async fn main() {
	start(ApiOptions { port: 8000 })
		.await
		.expect("server error");
}
